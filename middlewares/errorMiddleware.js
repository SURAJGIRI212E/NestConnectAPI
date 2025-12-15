export default (error, req, res, next) => {      
    error.statusCode=error.statusCode || 500;
    error.status=error.status || 'error';

        if (process.env.NODE_ENV === 'development') {
          
            res.status(error.statusCode).json({
               status:error.status,
                message: error.message ,
                stackTrace:error.stack,
                error:error.error,//additional error info if any not follow our structure
            });
        }
        else{//production error
           if (error.isOperational) { //error which throwed by us using CustomError class and follow our structure 
               res.status(error.statusCode).json({
                 status:error.status,
                  message: error.message,
              });
            }
            else{//for other errors which not follow our structure
                res.status(500).json({
                    status:'error',
                 message:'Something went wrong please try again later', 
                 });
                
           }
        }
    }