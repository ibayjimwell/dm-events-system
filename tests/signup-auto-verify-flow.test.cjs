const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('login requires valid credentials before it reports OTP requirements', () => {
  const src = read('app/api/auth/login/route.ts');
  const badPassword = src.indexOf('comparePassword(data.password, user.passwordHash)');
  const pendingAccount = src.indexOf("code: 'ACCOUNT_VERIFICATION_REQUIRED'");
  const session = src.indexOf('await createSession(user.id, user.role)');
  assert.ok(badPassword > 0 && pendingAccount > badPassword && session > pendingAccount);
  assert.match(src, /emailVerified:\s*Boolean\(user\.emailVerifiedAt\)/);
  assert.match(src, /phoneVerified:\s*Boolean\(user\.phoneVerifiedAt\)/);
  assert.match(src, /return ok\(\{[\s\S]*?ACCOUNT_VERIFICATION_REQUIRED[\s\S]*?\}, 403\)/);
});

test('login redirects only for structured OTP-required error and never exposes standalone Verify Account link', () => {
  const component = read('src/components/client/AuthForms.tsx');
  assert.doesNotMatch(component, /<Link\s+href=["']\/verify-email["']/);
  assert.match(component, /caught instanceof ApiError/);
  assert.match(component, /caught\.status === 403 && caught\.code === 'ACCOUNT_VERIFICATION_REQUIRED'/);
  assert.match(component, /router\.replace\(`\/verify-email\?email=/);
  assert.match(component, /setPassword\(''\)/);
});

test('signup automatically starts OTP confirmation and confirmation completes on the login page', () => {
  const component = read('src/components/client/AuthForms.tsx');
  assert.match(component, /if \(result\.verificationRequired\)/);
  assert.match(component, /rememberOtpProgress\(\{ email: result\.email\.toLowerCase\(\), emailVerified: false, phoneVerified: false \}\)/);
  assert.match(component, /router\.replace\(`\/login\?verified=1&email=/);
  assert.match(component, /Your email and phone are verified\. Log in to continue\./);
  assert.match(component, /VERIFICATION_STATE_KEY/);
  assert.match(component, /if \(mode === 'verify' && !legacyVerificationToken\)/);
});

test('changes are valid TypeScript / TSX modules', () => {
  for (const file of ['app/api/auth/login/route.ts', 'src/api-client/http.ts', 'src/components/client/AuthForms.tsx']) {
    const result = ts.transpileModule(read(file), {fileName:file, reportDiagnostics:true, compilerOptions:{jsx:ts.JsxEmit.ReactJSX, module:ts.ModuleKind.ESNext, target:ts.ScriptTarget.ES2022}});
    assert.equal(result.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0, file);
  }
});
