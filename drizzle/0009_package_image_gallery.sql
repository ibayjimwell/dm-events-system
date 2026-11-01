-- Additive gallery storage: legacy image_id remains the primary/cover image.
ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS image_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];
UPDATE public.packages SET image_ids = ARRAY[image_id]::uuid[] WHERE image_id IS NOT NULL AND cardinality(image_ids)=0;
-- No image asset or package rows are deleted. API validates gallery images on write.

-- Optional precise coordinates; manual addresses retain NULL values.
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS venue_latitude double precision;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS venue_longitude double precision;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bookings_venue_coordinates_pair_check') THEN
  ALTER TABLE public.bookings ADD CONSTRAINT bookings_venue_coordinates_pair_check CHECK (
   (venue_latitude IS NULL AND venue_longitude IS NULL) OR
   (venue_latitude BETWEEN -90 AND 90 AND venue_longitude BETWEEN -180 AND 180)
  );
 END IF;
END $$;
