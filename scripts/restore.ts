/**
 * Restores a DM Events manual data snapshot to a SEPARATE, EMPTY database with migrated schema.
 * No production overwrite. All inserts and nullable-FK re-linking happen in one transaction.
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { unpackManualBackup, type BackupTable } from '../src/lib/manualBackupFormat';

config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

function quoteIdent(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error('Invalid database identifier in backup.');
  return `"${value}"`;
}

function databaseIdentity(raw: string): string {
  const url = new URL(raw);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Restore target is not PostgreSQL.');
  return `${url.hostname.toLowerCase()}:${url.port || '5432'}/${decodeURIComponent(url.pathname)}`;
}

type ForeignColumn = { child: string; parent: string; column: string; notNull: boolean };

/** Nullable cross-references are filled in a second pass, breaking common booking↔media cycles. */
function dependencyOrder(tables: BackupTable[], dependencies: ForeignColumn[], deferred: Map<string, Set<string>>): BackupTable[] {
  const remaining = new Map(tables.map(table => [table.name, table]));
  const result: BackupTable[] = [];
  while (remaining.size) {
    const next = [...remaining.values()].find(table => !dependencies.some(edge =>
      edge.child === table.name && edge.parent !== table.name && remaining.has(edge.parent)
      && !deferred.get(edge.child)?.has(edge.column)));
    if (!next) throw new Error('Required foreign-key cycle detected. Restore requires a custom PostgreSQL recovery plan.');
    result.push(next);
    remaining.delete(next.name);
  }
  return result;
}

async function main() {
  const file = process.argv[2];
  if (!file || process.argv[3] !== 'RESTORE-TO-EMPTY-DATABASE') {
    throw new Error('Usage: npm run restore -- <backup.json.gz> RESTORE-TO-EMPTY-DATABASE');
  }
  const source = process.env.DATABASE_URL;
  const destination = process.env.RESTORE_DATABASE_URL;
  if (!destination) throw new Error('Set RESTORE_DATABASE_URL to a SEPARATE EMPTY STAGING PostgreSQL database.');
  if (source && databaseIdentity(destination) === databaseIdentity(source)) {
    throw new Error('REFUSED: RESTORE_DATABASE_URL points to the same host/database as DATABASE_URL.');
  }
  const backup = unpackManualBackup(await readFile(resolve(file)));
  console.log(`Verified backup from ${backup.exportedAt}: ${backup.tableCount} tables, ${backup.rowCount} rows.`);
  console.log(`Restore target: EMPTY database ${databaseIdentity(destination)}.`);
  const client = postgres(destination, { max: 1, prepare: false });
  try {
    await client.begin(async tx => {
      const catalog = await tx.unsafe(`SELECT c.relname AS name FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relispartition`);
      const available = new Set(catalog.map(row => row.name as string));
      for (const table of backup.tables) {
        if (!available.has(table.name)) throw new Error(`Target missing public.${table.name}. Run Drizzle migrations in the empty target first.`);
      }
      for (const table of catalog) {
        const name = table.name as string;
        const found = await tx.unsafe(`SELECT EXISTS (SELECT 1 FROM public.${quoteIdent(name)} LIMIT 1) AS used`);
        if (found[0]?.used) throw new Error(`REFUSED: public.${name} has data. Use a new EMPTY staging database.`);
      }
      const fkRows = await tx.unsafe(`SELECT child.relname AS child, parent.relname AS parent,
          child_att.attname AS column, child_att.attnotnull AS "notNull"
        FROM pg_catalog.pg_constraint fk
        JOIN pg_catalog.pg_class child ON child.oid = fk.conrelid
        JOIN pg_catalog.pg_namespace child_ns ON child_ns.oid = child.relnamespace
        JOIN pg_catalog.pg_class parent ON parent.oid = fk.confrelid
        JOIN pg_catalog.pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
        JOIN LATERAL unnest(fk.conkey) AS fk_col(attnum) ON true
        JOIN pg_catalog.pg_attribute child_att ON child_att.attrelid = fk.conrelid AND child_att.attnum = fk_col.attnum
        WHERE fk.contype = 'f' AND child_ns.nspname = 'public' AND parent_ns.nspname = 'public'`);
      const dependencies: ForeignColumn[] = fkRows.map(row => ({
        child: row.child as string, parent: row.parent as string,
        column: row.column as string, notNull: row.notNull as boolean,
      }));
      const deferred = new Map<string, Set<string>>();
      for (const edge of dependencies) {
        if (edge.notNull) continue;
        const cols = deferred.get(edge.child) ?? new Set<string>();
        cols.add(edge.column);
        deferred.set(edge.child, cols);
      }
      const ordered = dependencyOrder(backup.tables, dependencies, deferred);
      let restored = 0;
      for (const table of ordered) {
        if (!table.rows.length) continue;
        const columns = await tx.unsafe(`SELECT column_name, is_generated FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1`, [table.name]);
        const valid = new Map(columns.map(row => [row.column_name as string, row.is_generated as string]));
        for (const col of table.columns) {
          if (!valid.has(col)) throw new Error(`Target lacks ${table.name}.${col}. Schema version differs.`);
        }
        const writable = table.columns.filter(col => valid.get(col) !== 'ALWAYS' && !deferred.get(table.name)?.has(col));
        if (!writable.length) throw new Error(`Table ${table.name} has no writable base columns.`);
        const fields = writable.map(quoteIdent).join(', ');
        const target = `public.${quoteIdent(table.name)}`;
        const insert = `INSERT INTO ${target} (${fields}) OVERRIDING SYSTEM VALUE
          SELECT ${fields} FROM jsonb_populate_recordset(NULL::${target}, $1::jsonb)`;
        for (let offset = 0; offset < table.rows.length; offset += 250) {
          const chunk = table.rows.slice(offset, offset + 250);
          await tx.unsafe(insert, [`[${chunk.join(',')}]`]);
          restored += chunk.length;
        }
      }
      // All referenced records exist now. Restore nullable FK columns without breaking dependency cycles.
      for (const table of backup.tables) {
        const fks = [...(deferred.get(table.name) ?? [])].filter(col => table.columns.includes(col));
        if (!table.rows.length || !fks.length) continue;
        const primary = await tx.unsafe(`SELECT att.attname AS column
          FROM pg_catalog.pg_constraint pk
          JOIN pg_catalog.pg_class rel ON rel.oid = pk.conrelid
          JOIN pg_catalog.pg_namespace n ON n.oid = rel.relnamespace
          JOIN LATERAL unnest(pk.conkey) AS pk_col(attnum) ON true
          JOIN pg_catalog.pg_attribute att ON att.attrelid = rel.oid AND att.attnum = pk_col.attnum
          WHERE pk.contype = 'p' AND n.nspname = 'public' AND rel.relname = $1`, [table.name]);
        const keys = primary.map(row => row.column as string);
        if (!keys.length) throw new Error(`Cannot restore nullable references: ${table.name} has no primary key.`);
        const target = `public.${quoteIdent(table.name)}`;
        const updates = fks.map(col => `${quoteIdent(col)} = src.${quoteIdent(col)}`).join(', ');
        const match = keys.map(col => `dst.${quoteIdent(col)} = src.${quoteIdent(col)}`).join(' AND ');
        const update = `UPDATE ${target} AS dst SET ${updates}
          FROM jsonb_populate_recordset(NULL::${target}, $1::jsonb) AS src WHERE ${match}`;
        for (let offset = 0; offset < table.rows.length; offset += 250) {
          await tx.unsafe(update, [`[${table.rows.slice(offset, offset + 250).join(',')}]`]);
        }
      }
      if (restored !== backup.rowCount) throw new Error('Restore row count mismatch; all changes rolled back.');
      console.log(`Inserted ${restored} rows and relinked nullable foreign keys in one transaction.`);
    });
    console.log('RESTORE COMMITTED. Verify the staging site before considering any real recovery.');
  } finally {
    await client.end({ timeout: 5 });
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Restore failed.'); process.exitCode = 1; });
