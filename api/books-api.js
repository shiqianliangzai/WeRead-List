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

// 模拟获取微信文章内容的工具
async function getWeChatArticleContent(url) {
  try {
    console.log(`调用模拟工具获取微信文章内容: ${url}`);
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

// 从微信文章中提取书籍列表的函数
async function extractBooksFromWeChatArticle(url) {
  try {
    console.log(`开始从微信文章提取书籍列表: ${url}`);
    
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
    
    // 检查是否需要工具调用
    try {
      const contentObj = JSON.parse(fullContent);
      if (contentObj.name && contentObj.name.includes('GetArticle') && contentObj.parameters?.url) {
        const articleData = await getWeChatArticleContent(contentObj.parameters.url);
        
        const secondResponse = await apiClient.chat.stream({
          bot_id: config.botId,
          user_id: config.userId,
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
        
        let secondFullContent = '';
        for await (const chunk of secondResponse) {
          let content = '';
          if (chunk.event === 'conversation.message.delta') {
            content = chunk.data?.choices?.[0]?.delta?.content || '';
          }
          if (content) {
            secondFullContent += content;
          }
        }
        
        if (secondFullContent) {
          fullContent = secondFullContent;
        }
      }
    } catch (e) {
      // 忽略JSON解析错误
    }
    
    // 解析返回的内容
    try {
      let parsedResult = null;
      
      // 尝试解析JSON
      try {
        const jsonEndMatch = fullContent.match(/\}\s*$/);
        if (jsonEndMatch) {
          const firstJson = fullContent.substring(0, jsonEndMatch.index + 1);
          parsedResult = JSON.parse(firstJson);
        }
      } catch (e1) {}
      
      // 尝试寻找books数组
      if (!parsedResult) {
        try {
          const booksMatch = fullContent.match(/"books"\s*:\s*\[([\s\S]*?)\]/);
          if (booksMatch) {
            const booksArrayStr = `{"books":[${booksMatch[1]}]}`;
            parsedResult = JSON.parse(booksArrayStr);
          }
        } catch (e2) {}
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
        } catch (e3) {}
      }
      
      if (parsedResult) {
        return parsedResult;
      } else {
        // 如果所有解析方法都失败，尝试提取原始文本中的书籍标题
        const titleMatches = fullContent.match(/"title"\s*:\s*"([^"]+)"/g);
        if (titleMatches) {
          const books = titleMatches.map(match => {
            const title = match.match(/"title"\s*:\s*"([^"]+)"/)[1];
            return { title };
          });
          return { books };
        }
        
        return { content: fullContent.substring(0, 1000) + '...' };
      }
    } catch (error) {
      return { content: '解析错误: ' + error.message };
    }
  } catch (error) {
    console.error('提取书籍列表出错:', error.message);
    throw error;
  }
}

module.exports = async function handler(req, res) {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // 处理OPTIONS请求
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  
  // 只处理POST请求
  if (req.method !== 'POST') {
    res.status(405).json({
      success: false,
      error: '只支持POST请求'
    });
    return;
  }
  
  try {
    const { url } = req.body;
    
    if (!url) {
      res.status(400).json({
        success: false,
        error: '缺少微信文章URL'
      });
      return;
    }
    
    const booksResult = await extractBooksFromWeChatArticle(url);
    
    res.status(200).json({
      success: true,
      data: booksResult
    });
  } catch (error) {
    console.error('API处理错误:', error);
    res.status(500).json({
      success: false,
      error: error.message || '服务器内部错误'
    });
  }
}