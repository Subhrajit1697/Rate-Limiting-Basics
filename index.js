require('dotenv').config();
const Redis = require('ioredis');
const express = require('express');
const { RateLimiterRedis } = require('rate-limiter-flexible');
const app = express();
const port = 3000;

const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
})

redis.on('connect', () => {
    console.log('Redis client connected');
});

redis.on('error', (err) => {
    console.error('Redis error:', err);
});

const rateLimiter = new RateLimiterRedis({
    storeClient: redis,
    points: 10,         
    duration: 20,       
    keyPrefix: 'api',   
    blockDuration: 60   
});

app.set('trust proxy', true); // this is for rate limiter to work with proxy
app.use(express.json());


// Rate limiting middleware
const apiRateLimiter = async (req, res, next) => {
    try {
        console.log('req.ip', req.ip);
        const clientIP = req.ip;
        const rateLimiterRes = await rateLimiter.consume(clientIP);
        console.log('rateLimiterRes', rateLimiterRes);
        res.set({
            'X-RateLimit-Limit': 10,
            'X-RateLimit-Remaining': rateLimiterRes.remainingPoints,
            'X-RateLimit-Reset': new Date(Date.now() + rateLimiterRes.msBeforeNext).toISOString()
        });

        next();
    } catch (rateLimiterRes) {
        console.log('rateLimiterRes error', rateLimiterRes);
        res.set({
            'X-RateLimit-Limit': 10,
            'X-RateLimit-Remaining': rateLimiterRes.remainingPoints,
            'X-RateLimit-Reset': new Date(Date.now() + rateLimiterRes.msBeforeNext).toISOString(),
            'Retry-After': Math.ceil(rateLimiterRes.msBeforeNext / 1000)
        });

        return res.status(429).json({
            error: 'Too Many Requests',
            message: `Rate limit exceeded. Try again in ${Math.ceil(rateLimiterRes.msBeforeNext / 1000)} seconds.`
        });
    }
};

app.get('/api/data', apiRateLimiter, (req, res) => {
    res.json({
        success: true,
        data: {
            message: 'Sample API response',
            timestamp: new Date().toISOString()
        }
    });
});

app.get('/', (req, res) => {
    res.send('Hello World!');
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});