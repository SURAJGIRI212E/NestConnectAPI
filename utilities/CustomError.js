class CustomError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status=statusCode >=400 && statusCode < 500 ? 'fail' : 'error'; // Set the status based on the status code
    this.isOperational = true;

    // Capture the stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}
export default CustomError;
