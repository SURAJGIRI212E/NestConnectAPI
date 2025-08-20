export const subscriptionPlans = {
  MONTHLY: {
    id: process.env.RAZORPAY_MONTHLY_PLAN_ID ,
    name: 'MONTHLY',
    price: 50,
    duration: '1 month'
  },
  ANNUAL: {
    id: process.env.RAZORPAY_ANNUAL_PLAN_ID,
    name: 'ANNUAL',
    price: 480,
    duration: '1 year'
  }
}; 
subscriptionPlans.ANNUAL.id