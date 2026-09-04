update storage.buckets
set allowed_mime_types = array[
  'text/csv',
  'text/plain',
  'text/markdown',
  'application/json',
  'application/x-ndjson',
  'application/xml',
  'text/xml',
  'application/yaml',
  'application/x-yaml',
  'text/yaml',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.apache.parquet',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/octet-stream'
]::text[]
where id = 'dataset-files';
