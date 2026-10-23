
import { and, eq } from 'drizzle-orm';

import { route, HttpError } from '@/lib/http';
import { actor } from '@/lib/auth';
import { db } from '@/db';

import {
  mediaAssets,
  bookings,
  packages,
  siteContent,
} from '@/db/schema';

import { cloud } from '@/lib/cloudinary';

export const runtime = 'nodejs';

export const GET = route(
  async (
    _req,
    ctx: { params: Promise<{ id: string }> }
  ) => {
    const { id } = await ctx.params;

    const [asset] = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, id));

    if (!asset) {
      throw new HttpError(404, 'Image not found.');
    }

    const user = await actor();

    let allowed = false;

    // Published homepage photo.
    if (asset.kind === 'HERO') {
      const [content] = await db
        .select()
        .from(siteContent)
        .where(eq(siteContent.heroImageId, id));

      allowed = !!content;
    }

    // Published package image.
    if (asset.kind === 'PACKAGE') {
      const [pkg] = await db
        .select()
        .from(packages)
        .where(
          and(
            eq(packages.imageId, id),
            eq(packages.published, true)
          )
        );

      allowed = !!pkg;
    }

    // Administrator or original uploader.
    if (
      user?.role === 'ADMIN' ||
      user?.id === asset.uploadedBy
    ) {
      allowed = true;
    }

    // Booking-linked images.
    if (user && asset.bookingId) {
      const [booking] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.id, asset.bookingId));

      if (
        booking &&
        (user.role === 'COORDINATOR' ||
          user.role === 'ADMIN' ||
          booking.clientId === user.id)
      ) {
        allowed = true;
      }
    }

    if (!allowed) {
      throw new HttpError(404, 'Image not found.');
    }

    const format =
      asset.mimeType === 'image/jpeg'
        ? 'jpg'
        : asset.mimeType === 'image/png'
          ? 'png'
          : 'webp';

    // Support both old and new saved public IDs.
    const hasExtension =
      /\.(?:jpe?g|png|webp)$/i.test(asset.publicId);

    const url = cloud().url(asset.publicId, {
      resource_type: 'image',
      type:
        asset.deliveryType === 'authenticated'
          ? 'authenticated'
          : 'upload',
      secure: true,
      sign_url:
        asset.deliveryType === 'authenticated',
      ...(hasExtension ? {} : { format }),
    });

    let upstream: Response;

    try {
      upstream = await fetch(url, {
        cache: 'no-store',
      });
    } catch (error) {
      console.error(
        '[Cloudinary] Image delivery connection failed:',
        error
      );

      throw new HttpError(
        502,
        'Image could not be retrieved from Cloudinary.'
      );
    }

    if (!upstream.ok || !upstream.body) {
      console.error(
        '[Cloudinary] Image delivery failed:',
        upstream.status
      );

      throw new HttpError(
        502,
        'Image unavailable from Cloudinary.'
      );
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': asset.mimeType,
        'Cache-Control':
          asset.deliveryType === 'authenticated'
            ? 'private, no-store'
            : 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }
);
