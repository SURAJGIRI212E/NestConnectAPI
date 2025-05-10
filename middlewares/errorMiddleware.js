export default (error, req, res, next) => {      
    error.statusCode=error.statusCode || 500;
    error.status=error.status || 'error';

        if (process.env.NODE_ENV === 'development') {
            res.status(error.statusCode).json({
               status:error.status,
                message: error.message,
                stackTrace:error.stack,
                
            });
        }
        else{//production error
           if (error.isOperational) { //for custom error
               res.status(error.statusCode).json({
                 status:error.status,
                  message: error.message,
              });
            }
            else{//for other errors
                res.status(500).json({
                    status:'error',
                 message:'Something went wrong please try again later', 
                 });
                
           }
        }
    }