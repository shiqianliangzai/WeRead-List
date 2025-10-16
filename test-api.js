// 测试API调用脚本
import fetch from 'node-fetch';

async function testApi() {
  try {
    console.log('开始测试API调用...');
    const url = 'http://localhost:3000/api/books';
    const body = JSON.stringify({
      url: 'https://mp.weixin.qq.com/s/EudI858OBWbo9hohgb3iAw'
    });
    
    console.log(`请求URL: ${url}`);
    console.log(`请求体: ${body}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: body
    });
    
    console.log(`响应状态码: ${response.status}`);
    const data = await response.json();
    console.log('响应数据:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('API调用失败:', error.message);
  }
}

testApi();