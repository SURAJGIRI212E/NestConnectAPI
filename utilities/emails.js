import nodemailer from 'nodemailer';

const sendEmail=async (options)=>{

    let transporter = nodemailer.createTransport({
        host: process.env.USER_HOST,
        port: process.env.USER_PORT,
        auth: {
          user: process.env.USER_NAME,
          pass: process.env.USER_PASS,
        }
      });

    const emailOptions = {
        from: 'NestConnect support <nestconnectsupport.co>',
        to: options.email,
        subject: options.subject,
        html: options.message,
    };

    try {
        await transporter.sendMail(emailOptions);
    } catch (error) {
        console.error('Error sending email:', error);
        throw new Error('Email could not be sent. Please try again later.');
        
    }

}

export default sendEmail;