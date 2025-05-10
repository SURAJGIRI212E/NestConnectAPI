import nodemailer from 'nodemailer';

const sendEmail=async (options)=>{
    // const transporter = nodemailer.createTransport({
    //     host: process.env.EMAIL_HOST,
    //     port: process.env.EMAIL_PORT,
    //     auth: {
    //         user: process.env.EMAIL_USER,
    //         pass: process.env.EMAIL_PASS,
    //     },
    // });

    var transporter = nodemailer.createTransport({
        host: "live.smtp.mailtrap.io",
        port: process.env.USER_PORT,
        auth: {
          user: process.env.USER_NAME,
          pass: process.env.USER_PASS,
        }
      });

    const emailOptions = {
        from: 'Social support <suraj@demomailtrap.co>',
        to: options.email,
        subject: options.subject,
        text: options.message,
    };

    try {
        await transporter.sendMail(emailOptions);
    } catch (error) {
        console.error('Error sending email:', error);
        throw new Error('Email could not be sent. Please try again later.');
        
    }

}

export default sendEmail;