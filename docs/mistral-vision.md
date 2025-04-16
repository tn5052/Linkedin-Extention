Vision
Our latest Mistral Small and our Pixtral models possess vision capabilities, enabling them to analyze images and provide insights based on visual content in addition to text. This multimodal approach opens up new possibilities for applications that require both textual and visual understanding.

Models with Vision Capacilities:
Pixtral 12B (pixtral-12b-latest)
Pixtral Large 2411 (pixtral-large-latest)
Mistral Small 2503 (mistral-small-latest)
Passing an Image URL
If the image is hosted online, you can simply provide the URL of the image in the request. This method is straightforward and does not require any encoding.


- curl
curl https://api.mistral.ai/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MISTRAL_API_KEY" \
  -d '{
    "model": "pixtral-12b-2409",
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "What’s in this image?"
          },
          {
            "type": "image_url",
            "image_url": "https://tripfixers.com/wp-content/uploads/2019/11/eiffel-tower-with-snow.jpeg"
          }
        ]
      }
    ],
    "max_tokens": 300
  }'

## Rate Limiting 
1 image per second