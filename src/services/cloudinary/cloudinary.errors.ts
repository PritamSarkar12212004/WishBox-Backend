import { AppError } from "../../shared/errors.js";
import { HTTP_STATUS } from "../../consts/constants.js";

export class CloudinaryUploadError extends AppError {
  constructor(message = "Could not upload the image", details?: unknown) {
    super(message, HTTP_STATUS.BAD_GATEWAY, "CLOUDINARY_UPLOAD_FAILED", {
      details,
      isOperational: true,
    });
  }
}


export class CloudinaryNotConfiguredError extends AppError {
  constructor(
    message = "Image storage is not configured (set CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET)",
  ) {
    super(
      message,
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      "CLOUDINARY_NOT_CONFIGURED",
      {
        isOperational: true,
      },
    );
  }
}
