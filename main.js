// main.js

(function() {
    // Initialize Variables
    let selectedImages = null;
    let selectedDocs = null;
    let currentChatThreadId = null;
    const userApiKey = '1e1c0881-9498-45f6-a47c-9e18175b46d6'; // Replace with your actual API Key

    // Initialize Markdown-It with HTML enabled
    const md = window.markdownit({
        html: false,
        linkify: true,
        typographer: true
    });

    // Customize Code Block Rendering to Include Copy Button
    md.renderer.rules.fence = function (tokens, idx) {
        const token = tokens[idx];
        const langClass = token.info ? `language-${token.info}` : '';
        const escapedContent = md.utils.escapeHtml(token.content);
        // Return the HTML structure including copy button
        
        return `
            <div class="code-block relative rounded p-2 bg-gray-700">
                <div class="copy-button absolute top-2 cursor-pointer right-2 bg-blue-600 text-white px-2 py-1 rounded text-xs m-4 opacity-70 hover:opacity-100 shadow-lg focus:ring-2 focus:ring-offset-2 focus:ring-blue-300">Copy</div>
                <pre class="${langClass}"><code>${escapedContent}</code></pre>
            </div>
        `;
    };

    // Helper function to get the current assistant ID
    function getCurrentAssistantId() {
        const assistantSelect = document.getElementById('assistant-select');
        return assistantSelect ? assistantSelect.value : null;
    }

    // Get elements related to system message
    const assistantSelect = document.getElementById('assistant-select');
    const llmSelect = document.getElementById('llm-select'); // Added reference to llm-select
    llmSelect.selectedIndex = 0;
    const systemMessageContainer = document.getElementById('system-message-container');
    const editSystemMessageBtn = document.getElementById('edit-system-message-btn');
    const systemMessageDisplay = document.getElementById('system-message-display');
    const systemMessageEdit = document.getElementById('system-message-edit');
    const systemMessageText = document.getElementById('system-message-text');
    const systemMessageInput = document.getElementById('system-message-input');
    const saveSystemMessageBtn = document.getElementById('save-system-message-btn');

    // Conversation history
    let conversationHistory = [];

    // Event Listeners

    // Send Button Click
    const sendBtn = document.getElementById('send-btn');
    if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
    } else {
        console.error("Send button with id 'send-btn' not found.");
    }

    // User Input Keydown (Ctrl+Enter or Cmd+Enter to send)
    const userInput = document.getElementById('user-input');
    if (userInput) {
        userInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                sendMessage();
                e.preventDefault();
            }
        });
    } else {
        console.error("User input textarea with id 'user-input' not found.");
    }

    // Image Button Click to Open File Selector
    const imageBtn = document.getElementById('image-btn');
    if (imageBtn) {
        imageBtn.addEventListener('click', () => {
            const imageInput = document.getElementById('image-input');
            if (imageInput) {
                imageInput.click();
            } else {
                console.error("Image input with id 'image-input' not found.");
            }
        });
    } else {
        console.error("Image button with id 'image-btn' not found.");
    }

    // Image Input Change to Handle Selected Images
    const imageInput = document.getElementById('image-input');
    if (imageInput) {
        imageInput.addEventListener('change', function() {
            const files = this.files;
            if (files.length > 0) {
                selectedImages = files;
                showImageIndicator();
            }
        });
    } else {
        console.error("Image input with id 'image-input' not found.");
    }

    // Assistant Selection Change
    if (assistantSelect) {
        assistantSelect.addEventListener('change', function() {
            if (this.value === 'temporary') {
                // Show the system message container
                if (systemMessageContainer) {
                    systemMessageContainer.classList.remove('hidden');
                }
                // Show the llm-select
                if (llmSelect) {
                    llmSelect.classList.remove('hidden');
                }
                // Disable the assistant-select to fix the value
                assistantSelect.disabled = true;

                // Disable other options
                for (let i = 0; i < assistantSelect.options.length; i++) {
                    assistantSelect.options[i].disabled = assistantSelect.options[i].value !== 'temporary';
                }
            } else {
                // Hide the system message container
                if (systemMessageContainer) {
                    systemMessageContainer.classList.add('hidden');
                }
                // Hide the llm-select
                if (llmSelect) {
                    llmSelect.classList.add('hidden');
                }
                // Ensure the assistant-select remains enabled
                assistantSelect.disabled = false;

                // Enable all options
                for (let i = 0; i < assistantSelect.options.length; i++) {
                    assistantSelect.options[i].disabled = false;
                }
            }
        });
    } else {
        console.error("Assistant select with id 'assistant-select' not found.");
    }

    // LLM Selection Change
    if (llmSelect) {
        llmSelect.addEventListener('change', function() {
            const selectedModel = this.value;
            if (selectedModel === 'o1-mini' || selectedModel === 'o1-preview') {
                // Hide the system message container
                if (systemMessageContainer) {
                    systemMessageContainer.classList.add('hidden');
                }
                // Remove system message from conversation history
                conversationHistory = conversationHistory.filter(msg => msg.sender !== 'system');
            } else {
                // Show the system message container
                if (systemMessageContainer) {
                    systemMessageContainer.classList.remove('hidden');
                }
                // Add system message to conversation history if not present
                let systemMessageEntry = conversationHistory.find(msg => msg.sender === 'system');
                if (!systemMessageEntry) {
                    conversationHistory.unshift({
                        'sender': 'system',
                        'content': systemMessageText.innerText,
                        'sent_at': new Date().toISOString(),
                        'images': []
                    });
                }
            }
        });
    } else {
        console.error("LLM select with id 'llm-select' not found.");
    }

    // Edit System Message Button Click
    if (editSystemMessageBtn) {
        editSystemMessageBtn.addEventListener('click', function() {
            // Switch to edit mode
            systemMessageDisplay.classList.add('hidden');
            systemMessageEdit.classList.remove('hidden');
            // Set the textarea content to current system message
            systemMessageInput.value = systemMessageText.innerText;
        });
    }

    // Save System Message Button Click
    if (saveSystemMessageBtn) {
        saveSystemMessageBtn.addEventListener('click', function() {
            // Update the system message
            systemMessageText.innerText = systemMessageInput.value;
            // Switch back to display mode
            systemMessageDisplay.classList.remove('hidden');
            systemMessageEdit.classList.add('hidden');

            // Update the system message in conversationHistory
            let systemMessageEntry = conversationHistory.find(msg => msg.sender === 'system');
            if (systemMessageEntry) {
                systemMessageEntry.content = systemMessageText.innerText;
                systemMessageEntry.sent_at = new Date().toISOString();
            } else {
                // If not found, add it
                conversationHistory.unshift({
                    'sender': 'system',
                    'content': systemMessageText.innerText,
                    'sent_at': new Date().toISOString(),
                    'images': []
                });
            }
        });
    }

    // Fetch Chat History on Load
    window.addEventListener('load', () => {
        disableImageDraggingAndContextMenu();
        setupNewChatEntry(); // Set up the "New Chat" entry
        startNewChat(); // Start a new chat on page load
        fetchChatHistory();
    });

    // Function to set up the "New Chat" entry
    function setupNewChatEntry() {
        const newChatEntry = document.getElementById('new_chat_entry');
        if (newChatEntry) {
            newChatEntry.addEventListener('click', () => {
                startNewChat();

                // Remove 'bg-gray-700' from all chat history entries
                const allChatEntries = document.querySelectorAll('.chat-history-entry');
                allChatEntries.forEach(entry => {
                    entry.classList.remove('bg-gray-700');
                });

                // Add 'bg-gray-700' to 'New Chat' entry
                newChatEntry.classList.add('bg-gray-700');
            });
        } else {
            console.error("New Chat entry with id 'new_chat_entry' not found.");
        }
    }

    // Function to start a new chat
    function startNewChat() {
        currentChatThreadId = null; // Reset the current chat thread ID
        clearChatMessages(); // Clear the chat messages
        displayInitialBotMessage(); // Display the initial bot greeting

        // Remove 'bg-gray-700' from all entries
        const allChatEntries = document.querySelectorAll('.chat-history-entry');
        allChatEntries.forEach(entry => {
            entry.classList.remove('bg-gray-700');
        });

        // Add 'bg-gray-700' to 'New Chat' entry
        const newChatEntry = document.getElementById('new_chat_entry');
        if (newChatEntry) {
            newChatEntry.classList.add('bg-gray-700');
        }

        // Reset assistant-select
        if (assistantSelect) {
            assistantSelect.value = "asst_a95l9Zx6anqTbkq07rqHZqnJ"; // Reset to default assistant ID

            // Add 'Temporary' option if it doesn't exist
            let optionExists = Array.from(assistantSelect.options).some(option => option.value === 'temporary');
            if (!optionExists) {
                let temporaryOption = document.createElement('option');
                temporaryOption.value = 'temporary';
                temporaryOption.text = 'Temporary';
                assistantSelect.add(temporaryOption);
            }

            // Enable the assistant-select and all options
            assistantSelect.disabled = false;
            for (let i = 0; i < assistantSelect.options.length; i++) {
                assistantSelect.options[i].disabled = false;
            }

            // Hide the system message container
            if (systemMessageContainer) {
                systemMessageContainer.classList.add('hidden');
            }

            // Hide the llm-select on new chat
            if (llmSelect) {
                llmSelect.classList.add('hidden');
            }
        }

        // Reset system message to default
        if (systemMessageText) {
            systemMessageText.innerText = "You are a helpful assistant, helping with describing images or answering questions.";
        }
        if (systemMessageInput) {
            systemMessageInput.value = "You are a helpful assistant, helping with describing images or answering questions.";
        }

        // Reset conversation history
        conversationHistory = [];

        // Add system message to conversation history
        conversationHistory.push({
            'sender': 'system',
            'content': systemMessageText.innerText,
            'sent_at': new Date().toISOString(),
            'images': []
        });
    }

    // Function to clear chat messages from the chat window
    function clearChatMessages() {
        const messagesDiv = document.getElementById('chat_messages');
        if (messagesDiv) {
            messagesDiv.innerHTML = '';
        } else {
            console.error("Chat messages container with id 'chat_messages' not found.");
        }
    }

    // Function to display the initial bot greeting
    function displayInitialBotMessage() {
        displayMessage('Bot', 'Hallo, wie kann ich Ihnen heute helfen?');
    }

    // Fetch Chat History Function
    function fetchChatHistory() {
        fetch('/api/get_chat_history/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': userApiKey
            },
            body: JSON.stringify({})
        })
        .then(response => response.json())
        .then(data => {
            if (data.chats) {
                displayChatHistory(data.chats);
            } else {
                console.error('No chats found in response:', data);
            }
        })
        .catch(error => {
            console.error('Error fetching chat history:', error);
        });
    }

    // Display Chat History in chat_history div
    function displayChatHistory(chats) {
        const chatHistoryDiv = document.getElementById('chat_history');
        if (!chatHistoryDiv) {
            console.error("Chat history container with id 'chat_history' not found.");
            return;
        }

        // Clear existing chat entries
        const existingEntries = chatHistoryDiv.querySelectorAll('.chat-history-entry');
        existingEntries.forEach(entry => entry.remove());

        chats.forEach(chat => {
            const chatDiv = document.createElement('div');
            chatDiv.classList.add(
                'border-b', 'border-gray-500', 'flex', 'items-center', 'p-2',
                'cursor-pointer', 'hover:bg-gray-700', 'chat-history-entry',
                'z-10'
            );
            chatDiv.dataset.threadId = chat.thread_id;

            const title = chat.chat_description || chat.thread_id;

            chatDiv.innerHTML = `
                <div class="text-white">
                    <p class="text-sm font-semibold">${title}</p>
                    <p class="text-xs text-gray-300">${new Date(chat.creation_date).toLocaleString()}</p>
                </div>
            `;

            // Add click event listener
            chatDiv.addEventListener('click', () => {
                currentChatThreadId = chat.thread_id;
                fetchChatMessages(chat.thread_id);

                // Remove 'bg-gray-700' from all entries
                const allChatEntries = document.querySelectorAll('.chat-history-entry');
                allChatEntries.forEach(entry => {
                    entry.classList.remove('bg-gray-700');
                });

                // Also remove 'bg-gray-700' from 'New Chat' entry
                const newChatEntry = document.getElementById('new_chat_entry');
                if (newChatEntry) {
                    newChatEntry.classList.remove('bg-gray-700');
                }

                // Add 'bg-gray-700' to the clicked entry
                chatDiv.classList.add('bg-gray-700');
            });

            // Keep the clicked chat highlighted
            if (currentChatThreadId === chat.thread_id) {
                chatDiv.classList.add('bg-gray-700');
            }

            chatHistoryDiv.appendChild(chatDiv);
        });
    }

    // Fetch Chat Messages
    function fetchChatMessages(threadId) {
        clearChatMessages(); // Clear previous messages

        fetch('/api/load_chat_messages/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': userApiKey
            },
            body: JSON.stringify({ thread_id: threadId })
        })
        .then(response => response.json())
        .then(data => {
            if (data.messages) {
                displayChatMessages(data.messages);

                // Update the assistant-select value based on data.assistant_id
                if (assistantSelect && data.assistant_id) {
                    let optionExists = Array.from(assistantSelect.options).some(option => option.value === data.assistant_id);
                    if (!optionExists) {
                        const newOption = document.createElement('option');
                        newOption.value = data.assistant_id;
                        newOption.text = data.assistant_name || `Assistant ${data.assistant_id}`;
                        assistantSelect.add(newOption);
                    }
                    assistantSelect.value = data.assistant_id;

                    // Remove 'Temporary' option if it exists
                    const temporaryOption = assistantSelect.querySelector('option[value="temporary"]');
                    if (temporaryOption) {
                        assistantSelect.removeChild(temporaryOption);
                    }

                    // Disable the assistant-select if 'temporary' is selected
                    if (data.assistant_id === 'temporary') {
                        assistantSelect.disabled = true;

                        // Disable other options
                        for (let i = 0; i < assistantSelect.options.length; i++) {
                            assistantSelect.options[i].disabled = assistantSelect.options[i].value !== 'temporary';
                        }

                        // Show the system message container
                        if (systemMessageContainer) {
                            systemMessageContainer.classList.remove('hidden');
                        }

                        // Show the llm-select
                        if (llmSelect) {
                            llmSelect.classList.remove('hidden');
                        }
                    } else {
                        assistantSelect.disabled = false;

                        // Enable all options
                        for (let i = 0; i < assistantSelect.options.length; i++) {
                            assistantSelect.options[i].disabled = false;
                        }

                        // Hide the system message container
                        if (systemMessageContainer) {
                            systemMessageContainer.classList.add('hidden');
                        }

                        // Hide the llm-select
                        if (llmSelect) {
                            llmSelect.classList.add('hidden');
                        }
                    }
                }
            } else {
                console.error('No messages found in response:', data);
            }
        })
        .catch(error => {
            console.error('Error fetching chat messages:', error);
        });
    }

    // Display Chat Messages in the chat_messages div
    function displayChatMessages(messages) {
        const messagesDiv = document.getElementById('chat_messages');
        if (!messagesDiv) {
            console.error("Chat messages container with id 'chat_messages' not found.");
            return;
        }

        // Clear existing messages from the UI
        messagesDiv.innerHTML = '';

        messages.forEach(msg => {
            displayMessage(msg.sender === 'user' ? 'User' : msg.sender === 'assistant' ? 'Bot' : 'System', msg.content);

            // Add to conversation history if not already present
            const exists = conversationHistory.some(historyMsg =>
                historyMsg.sender === msg.sender &&
                historyMsg.content === msg.content &&
                historyMsg.sent_at === msg.sent_at
            );

            if (!exists) {
                conversationHistory.push({
                    'sender': msg.sender,
                    'content': msg.content,
                    'sent_at': msg.sent_at,
                    'images': [] // Handle images if they are stored in messages
                });
            }
        });
    }

    // Send Message Function
    function sendMessage() {
        const message = userInput.value.trim();

        if (message || (selectedImages && selectedImages.length > 0)) {
            let imagePromises = [];

            if (selectedImages && selectedImages.length > 0) {
                for (let i = 0; i < selectedImages.length; i++) {
                    imagePromises.push(getBase64(selectedImages[i]));
                }
            }

            Promise.all(imagePromises).then(base64Images => {
                // Display the message
                displayMessage('User', message, selectedImages ? Array.from(selectedImages).map(file => URL.createObjectURL(file)) : []);

                // Add message to conversation history
                let msgEntry = {
                    'sender': 'user',
                    'content': message,
                    'sent_at': new Date().toISOString(),
                    'images': base64Images || []
                };
                conversationHistory.push(msgEntry);

                // Send the message to the server
                const currentAssistantId = getCurrentAssistantId();
                if (currentAssistantId === 'temporary') {
                    sendMessageToChatCompletionAPI(message);
                } else {
                    sendMessageToAPI(message);
                }

                // Reset Input Fields
                userInput.value = '';
                imageInput.value = '';
                selectedImages = null;
                hideImageIndicator();

            }).catch(error => {
                console.error('Error encoding images:', error);
            });
        }
    }

    // Helper function to convert image file to base64
    function getBase64(file) {
        return new Promise(function(resolve, reject) {
            const reader = new FileReader();
            reader.onload = function() {
                const base64String = reader.result.split(',')[1]; // Remove data:image/png;base64, prefix
                resolve(base64String);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // Send Message to Assistant Endpoint
    function sendMessageToAPI(message) {
        displayLoader();

        const currentAssistantId = getCurrentAssistantId();

        const formData = new FormData();
        formData.append('message', message || "");
        formData.append('assistant_id', currentAssistantId);

        // Only append thread_id if it's valid
        if (currentChatThreadId) {
            formData.append('thread_id', currentChatThreadId);
        }

        // Include conversation history
        formData.append('conversation_history', JSON.stringify(conversationHistory));

        // Include images if any are selected
        if (selectedImages && selectedImages.length > 0) {
            for (let i = 0; i < selectedImages.length; i++) {
                formData.append('image', selectedImages[i]);
            }
            selectedImages = null; // Reset selected images
            hideImageIndicator();  // Hide the image indicator
        }

        fetch('/api/assistant/', {
            method: 'POST',
            headers: {
                'X-API-Key': userApiKey
            },
            body: formData,
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => { throw err; });
            }
            return response.json();
        })
        .then(data => {
            removeLoader();
            if (data.assistant_response) {
                displayMessage('Bot', data.assistant_response);

                // Add assistant's response to conversation history
                conversationHistory.push({
                    'sender': 'assistant',
                    'content': data.assistant_response,
                    'sent_at': new Date().toISOString(),
                    'images': []
                });
            }
            if (data.thread_id) {
                currentChatThreadId = data.thread_id;
                // fetchChatHistory(); // Removed to prevent duplication
            }
        })
        .catch(error => {
            removeLoader();
            console.error('Error during API request:', error);
            if (error.error) {
                displayMessage('Bot', `Fehler: ${error.error}`);
            } else {
                displayMessage('Bot', 'Es gab ein Problem bei der Kommunikation mit dem Bot.');
            }
        });
    }

    // Send Message to Chat Completion Endpoint
    function sendMessageToChatCompletionAPI(message) {
        displayLoader();

        const currentAssistantId = getCurrentAssistantId();

        const formData = new FormData();
        formData.append('message', message || "");
        formData.append('assistant_id', currentAssistantId);

        if (currentChatThreadId) {
            formData.append('thread_id', currentChatThreadId);
        }

        // If 'Temporary' is selected, include the system message and model
        if (currentAssistantId === 'temporary') {
            if (llmSelect) {
                const selectedModel = llmSelect.value;
                formData.append('model', selectedModel);

                if (selectedModel === 'o1-mini' || selectedModel === 'o1-preview') {
                    // Do not include system message
                    formData.append('system', '');
                } else {
                    const systemMessageTextElement = document.getElementById('system-message-text');
                    if (systemMessageTextElement) {
                        formData.append('system', systemMessageTextElement.innerText);
                    }
                }
            }
        }

        // Include conversation history
        formData.append('conversation_history', JSON.stringify(conversationHistory));

        // Include images if any are selected
        if (selectedImages && selectedImages.length > 0) {
            for (let i = 0; i < selectedImages.length; i++) {
                formData.append('image', selectedImages[i]);
            }
            selectedImages = null; // Reset selected images
            hideImageIndicator();  // Hide the image indicator
        }

        fetch('/api/chat/', {
            method: 'POST',
            headers: {
                'X-API-Key': userApiKey
            },
            body: formData,
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => { throw err; });
            }
            return response.json();
        })
        .then(data => {
            removeLoader();
            if (data.assistant_response) {
                displayMessage('Bot', data.assistant_response);

                // Add assistant's response to conversation history
                conversationHistory.push({
                    'sender': 'assistant',
                    'content': data.assistant_response,
                    'sent_at': new Date().toISOString(),
                    'images': []
                });
            }
            if (data.thread_id) {
                currentChatThreadId = data.thread_id;
                // fetchChatHistory(); // Removed to prevent duplication
            }
        })
        .catch(error => {
            removeLoader();
            console.error('Error during Chat Completion API request:', error);
            if (error.error) {
                displayMessage('Bot', `Fehler: ${error.error}`);
            } else {
                displayMessage('Bot', 'Es gab ein Problem bei der Kommunikation mit dem Bot.');
            }
        });
    }

    // Display Message in Chat
    function displayMessage(sender, message, imageURLs = null) {
        const messagesDiv = document.getElementById('chat_messages');
        if (!messagesDiv) {
            console.error("Chat messages container with id 'chat_messages' not found.");
            return;
        }

        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', sender.toLowerCase(), 'flex', 'mb-4', 'items-start');

        let parsedMessage = md.render(message);

        // Configure DOMPurify to allow necessary elements and attributes
        parsedMessage = DOMPurify.sanitize(parsedMessage, {
            ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'code', 'pre', 'div', 'span', 'ul', 'ol', 'li', 'br', 'img', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
            ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'style'],
        });

        let imageHTML = '';
        if (imageURLs && imageURLs.length > 0) {
            imageHTML = imageURLs.map(url => `<img src="${url}" alt="User Image" class="message-image max-w-xs mt-2 rounded cursor-pointer transition-transform transform hover:scale-105" draggable="false">`).join('');
        }

        let bgColor = 'bg-gray-700';
        if (sender.toLowerCase() === 'user') {
            bgColor = 'bg-slate-700';
        } else if (sender.toLowerCase() === 'system') {
            bgColor = 'bg-blue-700';
        }

        messageDiv.innerHTML = `
        <div class="flex items-start space-x-3 mr-auto ml-auto">
            <img src="/static/images/${sender.toLowerCase()}-icon.png" alt="${sender} Icon" class="w-10 h-10 rounded-full mr-4" draggable="false">
            <div class="message-content ${bgColor} text-white p-3 rounded-lg flex-1 vw-30">
                ${parsedMessage}
                ${imageHTML}
            </div>
        </div>`;
        messagesDiv.appendChild(messageDiv);

        // Highlight Code Blocks
        messageDiv.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });

        // Add Copy Button Functionality
        messageDiv.querySelectorAll('.copy-button').forEach((button) => {
            button.addEventListener('click', function() {
                const codeBlock = this.parentElement.querySelector('pre code');
                if (codeBlock) {
                    const codeText = codeBlock.innerText;
                    navigator.clipboard.writeText(codeText).then(() => {
                        this.innerText = 'Copied!';
                        setTimeout(() => {
                            this.innerText = 'Copy';
                        }, 2000);
                    }).catch(err => {
                        console.error('Failed to copy code: ', err);
                    });
                }
            });
        });

        // Add Click Event to Images to Open Modal
        if (imageURLs && imageURLs.length > 0) {
            const imgElements = messageDiv.querySelectorAll('.message-image');
            imgElements.forEach((imgElement, index) => {
                imgElement.addEventListener('click', function() {
                    openModal(imageURLs[index]);
                });
                imgElement.addEventListener('contextmenu', function(e) {
                    e.preventDefault();
                });
            });
        }

        // Scroll to the Bottom of Chat
        setTimeout(() => {
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }, 100);
    }

    // Display Loader While Waiting for API Response
    function displayLoader() {
        const messagesDiv = document.getElementById('chat_messages');
        if (!messagesDiv) {
            console.error("Chat messages container with id 'chat_messages' not found.");
            return;
        }

        const loaderDiv = document.createElement('div');
        loaderDiv.classList.add('message', 'bot', 'flex', 'mb-4', 'items-start');
        loaderDiv.innerHTML = `<div class="loader"></div>`;
        loaderDiv.id = 'loader';
        messagesDiv.appendChild(loaderDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    // Remove Loader After Receiving API Response
    function removeLoader() {
        const loaderDiv = document.getElementById('loader');
        if (loaderDiv) {
            loaderDiv.remove();
        } else {
            console.warn("Loader element with id 'loader' not found.");
        }
    }

    // Open Image Modal to Display Full-Size Image
    function openModal(imageSrc) {
        const modal = document.getElementById('image-modal');
        const modalImg = document.getElementById('full-image');
        if (modal && modalImg) {
            modal.classList.remove('hidden');
            modalImg.src = imageSrc;
        } else {
            console.error("Image modal or full-image element not found.");
        }
    }    

    // Show Image Selection Indicator
    function showImageIndicator() {
        const indicator = document.getElementById('image-selected-indicator');
        if (indicator) {
            indicator.classList.remove('hidden');
        } else {
            console.error("Image selection indicator with id 'image-selected-indicator' not found.");
        }
    }

    // Hide Image Selection Indicator
    function hideImageIndicator() {
        const indicator = document.getElementById('image-selected-indicator');
        if (indicator) {
            indicator.classList.add('hidden');
        } else {
            console.error("Image selection indicator with id 'image-selected-indicator' not found.");
        }
    }

    // Disable Image Dragging and Context Menu for All Images
    function disableImageDraggingAndContextMenu() {
        const images = document.querySelectorAll('img');
        images.forEach(img => {
            img.setAttribute('draggable', 'false');
            img.addEventListener('contextmenu', function(e) {
                e.preventDefault();
            });
        });
    }

    const modal = document.getElementById('image-modal');
    if (modal) {
        modal.addEventListener('click', function(event) {
            if (event.target === modal) {
                modal.classList.add('hidden');
            }
        });
    }
    
    // Close Image Modal When Clicking on Close Button
    const closeButtons = document.querySelectorAll('.close-button');
    closeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = document.getElementById('image-modal');
            if (modal) {
                modal.classList.add('hidden');
            } else {
                console.error("Image modal with id 'image-modal' not found.");
            }
        });
    });
})();