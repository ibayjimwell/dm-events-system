
import { v2 as cloudinary } from 'cloudinary';
import { HttpError } from '@/lib/http';

export type CloudinaryDeliveryType =
  | 'authenticated'
  | 'upload';

export function cloud() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();

  if (!cloudName || !apiKey || !apiSecret) {
    throw new HttpError(
      503,
      'Cloudinary is not configured on the server.'
    );
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  return cloudinary;
}

function logCloudinaryError(error: unknown) {
  const details = error as
    | {
        message?: string;
        http_code?: number;
        code?: string | number;
      }
    | null
    | undefined;

  let message =
    details?.message ?? 'Unknown Cloudinary error';

  // Prevent credentials from appearing in logs.
  for (const secret of [
    process.env.CLOUDINARY_API_KEY,
    process.env.CLOUDINARY_API_SECRET,
  ]) {
    if (secret) {
      message = message.replaceAll(
        secret,
        '[REDACTED]'
      );
    }
  }

  console.error('[Cloudinary] Upload failed:', {
    httpCode: details?.http_code ?? null,
    code: details?.code ?? null,
    message: message.slice(0, 500),
  });
}

export function sendToCloud(
  buffer: Buffer,
  folder: string,
  publicId: string,
  deliveryType: CloudinaryDeliveryType
): Promise<{ public_id: string }> {
  const client = cloud();

  return new Promise((resolve, reject) => {
    let finished = false;

    const fail = (error: unknown) => {
      if (finished) return;

      finished = true;
      logCloudinaryError(error);

      reject(
        new HttpError(
          502,
          'Cloudinary could not upload the image. Check the server logs.'
        )
      );
    };

    try {
      const stream = client.uploader.upload_stream(
        {
          folder,
          public_id: publicId,
          resource_type: 'image',
          type: deliveryType,
          overwrite: false,
          unique_filename: false,
        },
        (error, result) => {
          if (error || !result?.public_id) {
            fail(
              error ??
                new Error(
                  'Cloudinary returned no public_id'
                )
            );
            return;
          }

          if (finished) return;

          finished = true;

          resolve({
            public_id: result.public_id,
          });
        }
      );

      stream.on('error', fail);
      stream.end(buffer);
    } catch (error) {
      fail(error);
    }
  });
}
