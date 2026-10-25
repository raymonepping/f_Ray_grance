// Typed image-ingestion failures. The code is stored durably on the image row; the detail is a short,
// safe diagnostic for the owner (never a stack trace or response body).
export type ImageFailureCode =
  | 'INSECURE_URL'
  | 'HOST_NOT_APPROVED'
  | 'IP_LITERAL'
  | 'PRIVATE_ADDRESS'
  | 'REDIRECT_NOT_APPROVED'
  | 'TOO_MANY_REDIRECTS'
  | 'HTTP_ERROR'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'TOO_LARGE'
  | 'NOT_AN_IMAGE'
  | 'UNSUPPORTED_FORMAT'
  | 'DIMENSIONS'
  | 'DECODE_FAILED'
  | 'SOURCE_UNSUPPORTED'
  | 'SOURCE_DISABLED';

export class ImageError extends Error {
  constructor(
    readonly code: ImageFailureCode,
    message: string,
  ) {
    super(message);
  }
}
