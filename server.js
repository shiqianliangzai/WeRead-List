const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3000;

// MIME类型映射
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// 创建HTTP服务器
const server = http.createServer((req, res) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  
  // 解析请求URL
  const parsedUrl = url.parse(req.url);
  let pathname = parsedUrl.pathname;
  
  // 处理API路由
  if (pathname.startsWith('/api/')) {
    handleApiRequest(req, res, pathname);
    return;
  }
  
  // 处理静态文件
  handleStaticFile(req, res, pathname);
});

// 处理API请求
function handleApiRequest(req, res, pathname) {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // 处理OPTIONS请求
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  // 根据路径路由到不同的API处理函数
  if (pathname === '/api/books-api' && req.method === 'POST') {
    handleBooksApi(req, res);
  } else if (pathname === '/api/hello' && req.method === 'GET') {
    handleHelloApi(req, res);
  } else if (pathname === '/api/test-api' && req.method === 'GET') {
    handleTestApi(req, res);
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'API端点不存在' }));
  }
}

// 处理书籍API
function handleBooksApi(req, res) {
  let body = '';
  
  req.on('data', chunk => {
    body += chunk.toString();
  });
  
  req.on('end', async () => {
    try {
      const { url } = JSON.parse(body);
      
      if (!url) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: '缺少微信文章URL' }));
        return;
      }
      
      // 导入Coze API模块
      const { CozeAPI } = require('@coze/api');
      
      // 配置信息
      const config = {
        token: 'sat_dmY7PSQaSvnORnw2N8WuPbS5n5mO58RtZjQLjSbrcB0Zyr689cT60zM4q68NZvrt',
        baseURL: 'https://api.coze.cn',
        botId: '7556924025206456366',
        userId: '123456789'
      };
      
      // 创建API客户端
      const apiClient = new CozeAPI({
        token: config.token,
        baseURL: config.baseURL
      });
      
      console.log('开始调用Coze API提取书籍:', url);
      
      const response = await apiClient.chat.stream({
        bot_id: config.botId,
        user_id: config.userId,
        additional_messages: [
          {
            content: url,
            content_type: "text",
            role: "user",
            type: "question",
            auto_save_history: true
          }
        ],
        stream: true,
        timeout: 60000
      });

      let fullContent = '';
      let conversationId = null;
      
      for await (const chunk of response) {
        // 获取会话ID
        if (chunk.data?.conversation_id && !conversationId) {
          conversationId = chunk.data.conversation_id;
        }
        
        // 提取内容
        let content = '';
        if (chunk.event === 'conversation.message.delta') {
          content = chunk.data?.choices?.[0]?.delta?.content || 
                    chunk.data?.content || '';
        } else if (chunk.event === 'conversation.message.completed') {
          content = chunk.data?.content || '';
        } else if (chunk.event === 'conversation.chat.failed') {
          throw new Error(`API调用失败: ${chunk.data?.error_message || '未知错误'}`);
        }
        
        if (content) {
          fullContent += content;
        }
      }
      
      console.log('Coze API返回内容:', fullContent);
      
      // 解析返回的内容
      let parsedResult = null;
      
      // 尝试解析JSON
      try {
        const jsonEndMatch = fullContent.match(/\}\s*$/);
        if (jsonEndMatch) {
          const firstJson = fullContent.substring(0, jsonEndMatch.index + 1);
          parsedResult = JSON.parse(firstJson);
        }
      } catch (e1) {
        console.log('JSON解析失败，尝试其他解析方法');
      }
      
      // 尝试寻找books数组
      if (!parsedResult) {
        try {
          const booksMatch = fullContent.match(/"books"\s*:\s*\[([\s\S]*?)\]/);
          if (booksMatch) {
            const booksArrayStr = `{"books":[${booksMatch[1]}]}`;
            parsedResult = JSON.parse(booksArrayStr);
          }
        } catch (e2) {
          console.log('books数组解析失败');
        }
      }
      
      // 尝试寻找完整的书籍列表
      if (!parsedResult) {
        try {
          const startPos = fullContent.indexOf('{"list_title"');
          if (startPos !== -1) {
            let depth = 0;
            let endPos = -1;
            for (let i = startPos; i < fullContent.length; i++) {
              if (fullContent[i] === '{') depth++;
              if (fullContent[i] === '}') depth--;
              if (depth === 0) {
                endPos = i + 1;
                break;
              }
            }
            if (endPos !== -1) {
              const jsonStr = fullContent.substring(startPos, endPos);
              parsedResult = JSON.parse(jsonStr);
            }
          }
        } catch (e3) {
          console.log('完整书籍列表解析失败');
        }
      }
      
      if (parsedResult) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          data: parsedResult
        }));
      } else {
        // 如果所有解析方法都失败，返回原始内容
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          data: { content: fullContent }
        }));
      }
      
    } catch (error) {
      console.error('API处理错误:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: false, 
        error: error.message || '服务器内部错误' 
      }));
    }
  });
}

// 处理Hello API
function handleHelloApi(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    message: 'Hello from Local Server!',
    timestamp: new Date().toISOString(),
    environment: 'development'
  }));
}

// 处理测试API
function handleTestApi(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    success: true,
    message: 'API测试成功',
    timestamp: new Date().toISOString(),
    environment: 'development'
  }));
}

// 处理静态文件
function handleStaticFile(req, res, pathname) {
  // 默认文件为index.html
  if (pathname === '/') {
    pathname = '/index.html';
  }
  
  const filePath = path.join(__dirname, pathname);
  const extname = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[extname] || 'application/octet-stream';
  
  // 检查文件是否存在
  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        // 文件不存在，返回404
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 - 文件未找到</h1>');
      } else {
        // 服务器错误
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end('<h1>500 - 服务器内部错误</h1>');
      }
    } else {
      // 文件存在，返回内容
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
}

// 启动服务器
server.listen(PORT, () => {
  console.log('🚀 本地服务器已启动');
  console.log(`📖 请访问: http://localhost:${PORT}`);
  console.log('💡 按 Ctrl+C 停止服务器');
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n👋 正在关闭服务器...');
  server.close(() => {
    console.log('✅ 服务器已关闭');
    process.exit(0);
  });
});