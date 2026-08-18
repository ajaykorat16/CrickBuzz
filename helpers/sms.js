/**
 * SMS Helper abstraction for sending OTPs.
 * AWS SMS integration is currently paused and will be implemented in the future.
 */

async function sendOtpSms(mobile, otp) {
  // TODO: Future integration point for AWS SMS provider
  // e.g., awsSnsClient.publish({ PhoneNumber: mobile, Message: `Your OTP is ${otp}` })
  
  console.log(`[SMS_HELPER_PAUSED] Would have sent OTP ${otp} to ${mobile}`);
  return true;
}

module.exports = {
  sendOtpSms,
};
