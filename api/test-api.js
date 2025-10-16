export default async function handler(req, res) {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // 处理OPTIONS请求
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  
  // 返回简单的测试响应
  res.status(200).json({
    success: true,
    message: 'API测试成功',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
};