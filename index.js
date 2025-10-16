// 导入Coze API和必要的库
import { CozeAPI } from '@coze/api';
import fetch from 'node-fetch';

console.log('Coze API 测试程序启动');

// 创建API客户端 - 注意：token需要替换为有效的API密钥
const token = 'sat_dmY7PSQaSvnORnw2N8WuPbS5n5mO58RtZjQLjSbrcB0Zyr689cT60zM4q68NZvrt';
const baseURL = 'https://api.coze.cn';
const botId = '7556924025206456366';
const userId = '123456789';

const apiClient = new CozeAPI({
  token: token,
  baseURL: baseURL
});

// 模拟获取微信文章内容的工具
async function getWeChatArticleContent(url) {
  try {
    console.log(`\n调用模拟工具获取微信文章内容: ${url}`);
    // 在实际应用中，这里应该调用真实的API或爬虫来获取文章内容
    // 这里返回模拟数据
    return {
      title: "测试文章标题",
      author: "测试作者",
      publish_date: "2024-01-01",
      content: "这是一篇测试文章的内容。在实际应用中，这里应该包含从微信公众号文章中提取的完整内容。",
      url: url
    };
  } catch (error) {
    console.error('获取文章内容失败:', error.message);
    return { error: error.message };
  }
}

// 测试函数
async function testCozeAPI() {
  try {
    console.log('\n=== Coze API 测试开始 ===');
    console.log('当前使用的配置信息:');
    console.log('- token长度:', token.length, '字符');
    console.log('- baseURL:', baseURL);
    console.log('- bot_id:', botId);
    console.log('- user_id:', userId);
    
    // 构建消息内容 - 根据Coze API文档，应该使用additional_messages参数
    const additional_messages = [
      {
        content: "https://mp.weixin.qq.com/s/EudI858OBWbo9hohgb3iAw",
        content_type: "text",
        role: "user",
        type: "question",
        auto_save_history: true
      }
    ];
    
    console.log('\n开始调用Coze API...');
    
    // 使用正确的API调用参数格式
    const response = await apiClient.chat.stream({
      bot_id: botId,
      user_id: userId,
      additional_messages: additional_messages,
      stream: true,
      timeout: 60000 // 设置60秒超时
    });

    console.log('API调用成功，已建立连接，等待响应...');
    let fullContent = '';
    let chunkCount = 0;
    let errorCount = 0;
    let conversationId = null;
    
    // 处理流式响应 - 进一步简化输出，只记录关键信息
    let lastLogTime = Date.now();
    for await (const chunk of response) {
      chunkCount++;
      
      // 获取会话ID
      if (chunk.data?.conversation_id && !conversationId) {
        conversationId = chunk.data.conversation_id;
      }
      
      // 只打印必要的错误信息和内容概览，避免过多日志
      try {
        // 检查是否有错误
        if (chunk.event === 'error' || chunk.event === 'conversation.chat.failed') {
          errorCount++;
          console.error('API错误:', chunk.data?.code || chunk.data?.last_error?.code, chunk.data?.msg || chunk.data?.last_error?.msg);
        }
        
        // 根据事件类型提取内容
        let content = '';
        
        // 对于message.delta事件，内容可能在不同的位置
        if (chunk.event === 'conversation.message.delta') {
          content = chunk.data?.choices?.[0]?.delta?.content || 
                   chunk.data?.content || 
                   '';
        }
        // 对于其他可能包含内容的事件
        else {
          content = chunk.choices?.[0]?.delta?.content || 
                   chunk.choices?.[0]?.message?.content || 
                   chunk.data?.choices?.[0]?.delta?.content || 
                   chunk.content || '';
        }
        
        if (content) {
          fullContent += content;
          // 每5秒或获取到足够内容时才打印一次
          const now = Date.now();
          if (now - lastLogTime > 5000 || fullContent.length > 1000) {
            console.log(`已累积${fullContent.length}字符的内容...`);
            lastLogTime = now;
          }
        }
      } catch (e) {
        if (e.message && errorCount < 3) { // 只打印前3个错误
          console.error('处理错误:', e.message);
          errorCount++;
        }
      }
    }
    
    console.log('\n=== 第一阶段处理完成 ===');
    console.log(`总共接收了${chunkCount}个响应块，${errorCount}个错误`);
    
    if (fullContent) {
      console.log(`成功获取到${fullContent.length}字符的内容！`);
      console.log('内容预览:', fullContent.length > 300 ? fullContent.substring(0, 300) + '...' : fullContent);
      
      // 尝试解析内容，检查是否需要工具调用
      try {
        const contentObj = JSON.parse(fullContent);
        if (contentObj.name && contentObj.name.includes('GetArticle') && contentObj.parameters?.url) {
          console.log('检测到需要调用工具获取文章内容');
          
          // 调用工具获取文章内容
          const articleData = await getWeChatArticleContent(contentObj.parameters.url);
          
          // 将工具返回的结果发送回Coze API
          console.log('\n发送工具结果回Coze API...');
          
          const secondResponse = await apiClient.chat.stream({
            bot_id: botId,
            user_id: userId,
            conversation_id: conversationId,
            additional_messages: [
              {
                content: JSON.stringify(articleData),
                content_type: "text",
                role: "function",
                type: "response",
                auto_save_history: true
              }
            ],
            stream: true,
            timeout: 60000
          });
          
          // 处理第二轮响应
          let secondFullContent = '';
          let secondChunkCount = 0;
          
          for await (const chunk of secondResponse) {
            secondChunkCount++;
            
            try {
              // 提取内容
              let content = '';
              if (chunk.event === 'conversation.message.delta') {
                content = chunk.data?.choices?.[0]?.delta?.content || '';
              }
              
              if (content) {
                secondFullContent += content;
              }
            } catch (e) {
              // 忽略处理错误
            }
          }
          
          console.log('\n=== 第二阶段处理完成 ===');
          console.log(`总共接收了${secondChunkCount}个响应块`);
          if (secondFullContent) {
            console.log(`成功获取到最终结果: ${secondFullContent.length}字符`);
            console.log('最终结果预览:', secondFullContent.length > 500 ? secondFullContent.substring(0, 500) + '...' : secondFullContent);
          }
        }
      } catch (e) {
        console.log('内容不是有效的JSON格式，无法解析工具调用请求');
      }
    } else {
      console.log('未能获取到内容，可能的原因:');
      console.log('1. API密钥（token）无效 - 错误代码4101表示token不正确');
      console.log('2. 请确认从Coze官方平台获取了正确的API密钥');
      console.log('3. 检查bot_id是否有效且与token匹配');
      console.log('4. 可能需要检查API权限设置');
    }
    
    console.log('=== 测试结束 ===\n');
    
  } catch (error) {
    console.error('\nAPI调用出错:');
    console.error('- 错误类型:', error.name);
    console.error('- 错误消息:', error.message);
    if (error.response) {
      console.error('- 响应状态:', error.response.status);
      console.error('- 响应数据:', JSON.stringify(error.response.data, null, 2));
    } else if (error.code) {
      console.error('- 错误代码:', error.code);
    }
    console.log('=== 测试结束 (出错) ===\n');
  }
}

// 运行测试
testCozeAPI();