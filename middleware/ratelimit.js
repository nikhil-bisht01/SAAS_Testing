const rateLimit = require("express-rate-limit");

const Limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // max 10 requests per user per minute
  message: {
    error: "Too many requests. Please try again after a minute."
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => {
    // Use user ID if authenticated, else fallback to IP
    return req.user?.id || req.ip;
  }
});


const passwordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // max 5 failed attempts per window
    message: {
      error: "Too many failed attempts. Please try again after 15 minutes."
    },
    keyGenerator: (req) => req.body.email || req.ip // Rate limit per email
  });

  
  const otpLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 3, // max 3 OTP requests per window
    message: {
      error: "Too many OTP requests. Please wait before trying again."
    },
    keyGenerator: (req) => req.body.phone || req.body.email || req.ip
  });


module.exports = {
  Limiter,passwordLimiter,otpLimiter
};
