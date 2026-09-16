import express from 'express';

const router = express.Router();

// TEST ROUTE
router.post('/login', (req, res) => {
  res.json({
    success: true,
    message: 'Login route working',
    body: req.body
  });
});

export default router;