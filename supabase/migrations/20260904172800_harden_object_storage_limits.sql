update storage.buckets
set file_size_limit = 524288000,
    allowed_mime_types = array[
      'text/csv',
      'application/json',
      'application/x-ndjson',
      'application/vnd.apache.parquet',
      'application/octet-stream',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]::text[]
where id = 'dataset-files';

update storage.buckets
set file_size_limit = 104857600,
    allowed_mime_types = array[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/png',
      'image/jpeg',
      'image/webp',
      'text/plain',
      'text/markdown',
      'text/csv',
      'application/json'
    ]::text[]
where id = 'governance-artifacts';
