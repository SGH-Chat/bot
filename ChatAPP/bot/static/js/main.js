// main.js 

(async function() {
    // Initialize Variables
    let selectedImages = [];
    let selectedTextFiles = [];
    let currentChatThreadId = null;
    const userApiKey = 'b9527153-d056-4abf-af60-b8b7f5835a94'; // Replace with your actual API Key
    // Toggle Circle Movement, Background Color Change, and Checkbox State
    const toggleDiv = document.getElementById('toggle');
    const toggleCircle = document.getElementById('toggle-circle');
    const searchModeToggle = document.getElementById('search-mode-toggle'); // Reference to the checkbox
    let isToggled = false;
    const search_surname = document.getElementById('search-surname');
    const search_name = document.getElementById('search-name');
    const search_mail = document.getElementById('search-mail');
    const search_company = document.getElementById('search-company');

    function updateSendButtonState() {
        if (isSearchActive && isToggled && !search_mail.checkValidity()) {
            // Email is invalid, disable send button
            sendBtn.disabled = true;
        } else {
            // Email is valid or not required, enable send button
            sendBtn.disabled = false;
        }
    }

    if (search_mail) {
        search_mail.addEventListener('input', updateSendButtonState);
    }

    if (search_company) {
        search_company.addEventListener('keydown', async function (e) {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                if (isSearchActive && isToggled && !search_mail.checkValidity()) {
                    e.preventDefault();
                    alert("Bitte geben Sie eine gültige E-Mail-Adresse ein.");
                    return;
                }
                await sendMessage();
                e.preventDefault();
            }
        });
    } else {
        console.error("User input textarea with id 'search-company' not found.");
    }

    const search_query = document.getElementById('search-query');
    if (search_query) {
        search_query.addEventListener('keydown', async function (e) {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                if (isSearchActive && isToggled && !search_mail.checkValidity()) {
                    e.preventDefault();
                    alert("Bitte geben Sie eine gültige E-Mail-Adresse ein.");
                    return;
                }
                await sendMessage();
                e.preventDefault();
            }
        });
    } else {
        console.error("User input textarea with id 'search-query' not found.");
    }

    let isSearchActive = false; // Initialize the search active flag

    // Initialize Markdown-It with HTML enabled
    const md = window.markdownit({
        html: true,
        linkify: true,
        typographer: true
    });

    // Customize Code Block Rendering to Include Copy Button
    md.renderer.rules.fence = function(tokens, idx) {
        const token = tokens[idx];
        const langClass = token.info ? `language-${token.info}` : '';
        const content = token.content;
        return `
            <div class="code-block relative border border-transparent rounded p-2 bg-gray-700">
                <div class="copy-button m-2 absolute top-2 right-2 bg-blue-600 text-white px-2 py-1 rounded text-xs opacity-90 hover:opacity-100 shadow-inner hover:shadow-xl focus:ring-2 focus:ring-offset-2 focus:ring-blue-300 cursor-pointer">Copy</div>
                <pre class="${langClass}"><code>${md.utils.escapeHtml(content)}</code></pre>
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
    if (llmSelect) {
        llmSelect.selectedIndex = 0;
    } else {
        console.error("LLM select with id 'llm-select' not found.");
    }
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
        sendBtn.addEventListener('click', function() {
            if (isSearchActive && isToggled && !search_mail.checkValidity()) {
                alert("Bitte geben Sie eine gültige E-Mail-Adresse ein.");
                return;
            }
            sendMessage();
        });
    } else {
        console.error("Send button with id 'send-btn' not found.");
    }

    const jobsBtn = document.getElementById('jobs');
    if (jobsBtn) {
        jobsBtn.addEventListener('click', function() {
            window.location.href = '/jobs'; // Navigate to /jobs
        });
    } else {
        console.error("Button with id 'jobs' not found.");
    }

    // User Input Keydown (Ctrl+Enter or Cmd+Enter to send)
    const userInput = document.getElementById('user-input');
    if (userInput) {
        userInput.addEventListener('keydown', async function (e) {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                if (isSearchActive && isToggled && !search_mail.checkValidity()) {
                    e.preventDefault();
                    alert("Bitte geben Sie eine gültige E-Mail-Adresse ein.");
                    return;
                }
                await sendMessage();
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
            const attachInput = document.getElementById('attach-input');
            if (attachInput) {
                attachInput.click();
            } else {
                console.error("File input with id 'attach-input' not found.");
            }
        });
    } else {
        console.error("Image button with id 'image-btn' not found.");
    }

    // File Input Change to Handle Selected Files
    const attachInput = document.getElementById('attach-input');
    if (attachInput) {
        attachInput.addEventListener('change', function() {
            const files = this.files;
            if (files.length > 0) {
                selectedImages = [];
                selectedTextFiles = [];
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    const fileType = file.type;
                    const fileName = file.name.toLowerCase();

                    if (fileType.startsWith('image/')) {
                        selectedImages.push(file);
                    } else if (isAllowedTextFile(fileName)) {
                        selectedTextFiles.push(file);
                    } else {
                        console.warn(`Unsupported file type: ${fileType}`);
                    }
                }
                if (selectedImages.length > 0) {
                    showImageIndicator();
                }
                if (selectedTextFiles.length > 0) {
                    showAttachIndicator();
                }
            }
        });
    } else {
        console.error("File input with id 'attach-input' not found.");
    }

    // Function to check if a file is an allowed text file
    function isAllowedTextFile(fileName) {
        const allowedExtensions = ['pdf', 'txt', 'html', 'py', 'js', 'rs', 'json', 'jsonl'];
        return allowedExtensions.some(ext => fileName.endsWith(`.${ext}`));
    }

    // Assistant Selection Change
    if (assistantSelect) {
        assistantSelect.addEventListener('change', function() {
            // Update UI elements as needed
            if (this.value === 'temporary') {
                // Show the system message container
                if (systemMessageContainer) {
                    systemMessageContainer.classList.remove('hidden');
                }
                // Show the llm-select
                if (llmSelect) {
                    llmSelect.classList.remove('hidden');
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
            }

            // Notify user about the assistant change
            console.log(`Assistant changed to ${this.options[this.selectedIndex].text}.`);
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
    window.addEventListener('load', async () => {
        disableImageDraggingAndContextMenu();
        setupNewChatEntry(); // Set up the "New Chat" entry
        startNewChat(); // Start a new chat on page load
        await fetchChatHistory();
    });

    // Function to set up the "New Chat" entry
    function setupNewChatEntry() {
        const newChatEntry = document.getElementById('new_chat_entry');
        if (newChatEntry) {
            newChatEntry.addEventListener('click', () => {
                startNewChat();

                // Remove 'bg-gray-700' from all chat history entries
                const allChatEntries = document.querySelectorAll('.chat_history_entry');
                allChatEntries.forEach(entry => {
                    entry.classList.remove('bg-gray-700');
                });

                // Add 'bg-gray-700' to 'New Chat' entry
                newChatEntry.classList.add('bg-gray-700');

                // **Unlock the assistant-select element when "New Chat" is clicked**
                unlockAssistantSelect();
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
        const allChatEntries = document.querySelectorAll('.chat_history_entry');
        allChatEntries.forEach(entry => {
            entry.classList.remove('bg-gray-700');
        });

        // Add 'bg-gray-700' to 'New Chat' entry
        const newChatEntry = document.getElementById('new_chat_entry');
        if (newChatEntry) {
            newChatEntry.classList.add('bg-gray-700');
        }
        
        // Add 'Temporary' option if it doesn't exist
        let optionExists = Array.from(assistantSelect.options).some(option => option.value === 'temporary');
        if (!optionExists) {
            let temporaryOption = document.createElement('option');
            temporaryOption.value = 'temporary';
            temporaryOption.text = 'Temporary';
            assistantSelect.add(temporaryOption);
        }

        // Reset assistant-select
        if (assistantSelect) {
            assistantSelect.value = "asst_a95l9Zx6anqTbkq07rqHZqnJ"; // Reset to default assistant ID

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

        // Clear input fields
        if (userInput) {
            userInput.value = '';
        }
        if (search_query) {
            search_query.value = '';
        }
        if (search_name) {
            search_name.value = '';
        }
        if (search_surname) {
            search_surname.value = '';
        }
        if (search_mail) {
            search_mail.value = '';
        }
        if (search_company) {
            search_company.value = '';
        }
        deactivateSearch();
        assistantSelect.selectedIndex = 0;
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
    async function fetchChatHistory() {
        try {
            const response = await fetch('/api/get_chat_history/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': userApiKey
                },
                body: JSON.stringify({})
            });
            const data = await response.json();
            if (data.chats) {
                displayChatHistory(data.chats);
            } else {
                console.error('No chats found in response:', data);
            }
        } catch (error) {
            console.error('Error fetching chat history:', error);
        }
    }

    // Display Chat History in chat_history div
    function displayChatHistory(chats) {
        const chatHistoryDiv = document.getElementById('chat_history');
        if (!chatHistoryDiv) {
            console.error("Chat history container with id 'chat_history' not found.");
            return;
        }

        // Clear existing chat entries
        const existingEntries = chatHistoryDiv.querySelectorAll('.chat_history_entry');
        existingEntries.forEach(entry => entry.remove());

        chats.forEach(chat => {
            const chatDiv = document.createElement('div');
            chatDiv.classList.add(
                'border', 'border-0', 'border-slate-800', 'flex', 'items-center', 'p-2',
                'cursor-pointer', 'hover:bg-gray-700', 'chat_history_entry',
                'z-10', 'hover:border-gray-500','rounded-xl', 'z-0'
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
            chatDiv.addEventListener('click', async () => {
                if (chatDiv.classList.contains('locked')) {
                    // Chat is locked; do not allow changing the chat
                    return;
                }

                currentChatThreadId = chat.thread_id;
                await fetchChatMessages(chat.thread_id);

                // Remove 'bg-gray-700' from all entries
                const allChatEntries = document.querySelectorAll('.chat_history_entry');
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

                // Lock the assistant-select element to prevent changing assistants
                lockAssistantSelect();
            });

            // Keep the clicked chat highlighted
            if (currentChatThreadId === chat.thread_id) {
                chatDiv.classList.add('bg-gray-700');
            }

            chatHistoryDiv.appendChild(chatDiv);
        });
    }

    // Fetch Chat Messages
    async function fetchChatMessages(threadId) {
        clearChatMessages(); // Clear previous messages

        try {
            const response = await fetch('/api/load_chat_messages/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': userApiKey
                },
                body: JSON.stringify({ thread_id: threadId })
            });
            const data = await response.json();
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

                    // Hide or show system message container based on assistant
                    if (data.assistant_id === 'temporary') {
                        // Show the system message container
                        if (systemMessageContainer) {
                            systemMessageContainer.classList.remove('hidden');
                        }
                        // Show the llm-select
                        if (llmSelect) {
                            llmSelect.classList.remove('hidden');
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
                    }
                }
            } else {
                console.error('No messages found in response:', data);
            }
        } catch (error) {
            console.error('Error fetching chat messages:', error);
        }
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
    async function sendMessage() {
        const message = userInput.value.trim();    
        userInput.value = '';
        deactivateSearch();
        lockAssistantSelect();
        
        if (isSearchActive && isToggled && !search_mail.checkValidity()) {
            alert("Bitte geben Sie eine gültige E-Mail-Adresse ein.");
            return;
        }
        let query = `${message}`;
        // Handle the search
        if (isSearchActive) {
            let userMessage = '';
            let searchResults = '';
            if (isToggled) {
                const combinedString = `${search_name.value.trim()} ${search_surname.value.trim()} at ${search_company.value.trim()}`;
                const searchMail = search_mail.value.trim();
                userMessage = `${combinedString}\n${searchMail}`;
            } else {
                const searchQuery = search_query.value.trim();
                userMessage = searchQuery;
            }

            // Perform the search
            const data = await performSearch();
            const domains = data.results;
            const content = formatWebContents(data.web_contents);   
            query = `${query}\n\nWeb search result (crawled):\n${content}`;
        } 
        
        // Display the message
        displayMessage('User', message, selectedImages ? Array.from(selectedImages).map(file => URL.createObjectURL(file)) : []);
        // Handle attached documents
        if (selectedTextFiles.length > 0) {
            // Perform the Faiss search
            const data = await performFaissSearch(selectedTextFiles, message);
            //const content = formatWebContents(data.web_contents);
            query = `${query}\n\nDocument search result:\n${data.context}`;
            // Reset selected text files
            selectedTextFiles = [];
            hideAttachIndicator();
        }

        if (query || (selectedImages.length > 0)) {
            let base64Images = [];

            if (selectedImages.length > 0) {
                try {
                    const imagePromises = Array.from(selectedImages).map(file => getBase64(file));
                    base64Images = await Promise.all(imagePromises);
                } catch (error) {
                    console.error('Error encoding images:', error);
                    return;
                }
            }

            // Lock specified elements during send
            lockDuringSend();
            lockChatHistory();

            // Get the current assistant ID
            const currentAssistantId = getCurrentAssistantId();

            // Add message to conversation history
            let msgEntry = {
                'sender': 'user',
                'content': query,
                'sent_at': new Date().toISOString(),
                'images': base64Images || []
            };
            conversationHistory.push(msgEntry);

            // Send the message to the server
            try {
                if (currentAssistantId === 'temporary') {
                    await sendMessageToChatCompletionAPI(query);
                } else {
                    await sendMessageToAPI(query);
                }

                // Reset Input Fields
                attachInput.value = '';
                selectedImages = [];
                hideImageIndicator();
            } catch (error) {
                console.error('Error sending message:', error);
                // Ensure elements are unlocked in case of error
            } finally {
                // Unlock elements after sending the message or encountering an error
                unlockDuringSend();
                unlockChatHistory(); // Unlock chat history entries
            }
        }
    }
    /**
     * Formats the web_contents array into a single string.
     *
     * @param {Array} webContents - Array of objects containing 'url' and 'content'.
     * @returns {string} - Formatted string with each entry's URL and Content.
     */
    function formatWebContents(webContents) {
        if (!Array.isArray(webContents)) {
            console.error("Invalid input: webContents should be an array.");
            return "";
        }

        return webContents.map(item => {
            const url = item.url || "No URL Provided";
            const content = item.content || "No Content Available";
            return `URL: ${url}\nContent: "${content}"`;
        }).join('\n\n'); // Separates each entry with a blank line
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
    async function sendMessageToAPI(message) {
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
        if (selectedImages.length > 0) {
            for (let i = 0; i < selectedImages.length; i++) {
                formData.append('image', selectedImages[i]);
            }
            selectedImages = []; // Reset selected images
            hideImageIndicator();  // Hide the image indicator
        }

        try {
            const response = await fetch('/api/assistant/', {
                method: 'POST',
                headers: {
                    'X-API-Key': userApiKey
                },
                body: formData,
            });

            if (!response.ok) {
                const err = await response.json();
                throw err;
            }
            const data = await response.json();
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

            // Unlock elements after receiving the response
            unlockDuringSend();
            unlockChatHistory(); // Unlock chat history entries
        } catch (error) {
            removeLoader();
            console.error('Error during API request:', error);
            if (error.error) {
                displayMessage('Bot', `Fehler: ${error.error}`);
            } else {
                displayMessage('Bot', 'Es gab ein Problem bei der Kommunikation mit dem Bot.');
            }

            // Unlock elements in case of error
            unlockDuringSend();
            unlockChatHistory(); // Unlock chat history entries
        }
    }

    async function performSearch() {
        // Gather the input values
        const query = search_query.value.trim();
        const combinedString = `${search_name.value.trim()} ${search_surname.value.trim()} at ${search_company.value.trim()}`;
        const email = search_mail.value.trim();
        
        search_surname.value = '';
        search_name.value = '';
        search_mail.value = '';
        search_company.value = '';
        search_query.value = '';

        // Prepare payload based on toggle state
        const payload = isToggled
            ? { searchQuery: combinedString, searchMail: email } // If toggle is ON (simple mode)
            : { searchQuery: query }; // If toggle is OFF (detailed mode)

        try {
            // Send POST request to /api/search/
            const response = await fetch('/api/search/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': userApiKey, // Replace with your actual API key
                },
                body: JSON.stringify(payload),
            });

            // Handle response
            if (!response.ok) {
                throw new Error(`API request failed with status: ${response.status}`);
            }

            const data = await response.json();
            console.log("Search response:", data);

            // Handle successful response (e.g., displaying results)
            if (data.results && data.results.length > 0 && data.web_contents && data.web_contents.length > 0) {
                console.log("Search results:", data.results);
                console.log("Crawled Search results:", data.web_contents);
                return data;
            } else {
                console.warn("No results found:", data);
                return "No results found.";
            }
        } catch (error) {
            console.error("Error during search:", error);
            return "Error during search.";
        }
    }

    async function performFaissSearch(files, message) {
        // Create a new FormData object
        const formData = new FormData();
    
        // Append the message to the FormData
        formData.append('message', message.trim());
    
        // Append each file to the FormData using the key 'documents'
        if (files && files.length > 0) {
            for (let i = 0; i < files.length; i++) {
                formData.append('documents', files[i]);
                console.log(`Appended file ${files[i].name} to formData.`);
            }
        }
    
        // Include mode based on toggle state
        if (isToggled) {
            formData.append('mode', 'simple');
        } else {
            formData.append('mode', 'detailed');
        }
    
        // Debug: Log the formData entries
        for (var pair of formData.entries()) {
            console.log(pair[0]+ ', ' + pair[1]);
        }
    
        try {
            // Send POST request to /api/chat_with_doc/
            const response = await fetch('/api/chat_with_doc/', {
                method: 'POST',
                headers: {
                    'X-API-Key': userApiKey,
                },
                body: formData,
            });
    
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API request failed with status: ${response.status} - ${errorText}`);
            }
    
            const data = await response.json();
            console.log("Search response:", data);
    
            if (data.context) {
                console.log("Document search result:", data.context);
                return data;
            } else {
                console.warn("No results found:", data);
                return { context: '' };
            }
        } catch (error) {
            console.error("Error during document search:", error);
            return { context: '' };
        }
    }
    
    
    // Send Message to Chat Completion Endpoint
    async function sendMessageToChatCompletionAPI(message) {
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
        if (selectedImages.length > 0) {
            for (let i = 0; i < selectedImages.length; i++) {
                formData.append('image', selectedImages[i]);
            }
            selectedImages = []; // Reset selected images
            hideImageIndicator();  // Hide the image indicator
        }

        try {
            const response = await fetch('/api/chat/', {
                method: 'POST',
                headers: {
                    'X-API-Key': userApiKey
                },
                body: formData,
            });

            if (!response.ok) {
                const err = await response.json();
                throw err;
            }
            const data = await response.json();
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

            // Unlock elements after receiving the response
            unlockDuringSend();
            unlockChatHistory(); // Unlock chat history entries
        } catch (error) {
            removeLoader();
            console.error('Error during Chat Completion API request:', error);
            if (error.error) {
                displayMessage('Bot', `Fehler: ${error.error}`);
            } else {
                displayMessage('Bot', 'Es gab ein Problem bei der Kommunikation mit dem Bot.');
            }

            // Unlock elements in case of error
            unlockDuringSend();
            unlockChatHistory(); // Unlock chat history entries
        }
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

    // Show Attachment Selection Indicator
    function showAttachIndicator() {
        const indicator = document.getElementById('attach-selected-indicator');
        if (indicator) {
            indicator.classList.remove('hidden');
        } else {
            console.error("Attachment selection indicator with id 'attach-selected-indicator' not found.");
        }
    }

    // Hide Attachment Selection Indicator
    function hideAttachIndicator() {
        const indicator = document.getElementById('attach-selected-indicator');
        if (indicator) {
            indicator.classList.add('hidden');
        } else {
            console.error("Attachment selection indicator with id 'attach-selected-indicator' not found.");
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

    // Function to deactivate search
    function deactivateSearch() {
        // Get the search activation button
        const activateSearchBtn = document.getElementById('activate-search');
        if (!activateSearchBtn) {
            console.error("Button with id 'activate-search' not found.");
            return;
        }

        // Get the SVG element inside the button
        const svgElement = activateSearchBtn.querySelector('svg');
        if (svgElement) {
            // Reset the stroke color to original
            svgElement.setAttribute('stroke', '#8198CD');
        } else {
            console.error("SVG element inside 'activate-search' button not found.");
        }

        // Reset the search button text color
        const searchBtnText = document.getElementById('search-btn-text');
        if (searchBtnText) {
            searchBtnText.style.color = "#8198CD";
        } else {
            console.error("Element with id 'search-btn-text' not found.");
        }

        // Hide the search fields container
        const searchElement = document.getElementById('search');
        if (searchElement) {
            searchElement.classList.add('hidden');
        } else {
            console.error("Element with id 'search' not found.");
        }

        // Update the search active flag
        isSearchActive = false;

        // Update the send button state based on the new conditions
        updateSendButtonState();

        // Optionally, clear search fields if needed
        if (search_surname) search_surname.value = '';
        if (search_name) search_name.value = '';
        if (search_mail) search_mail.value = '';
        if (search_company) search_company.value = '';
        if (search_query) search_query.value = '';
    }

    const modal = document.getElementById('image-modal');
    if (modal) {
        modal.addEventListener('click', function(event) {
            if (event.target === modal) {
                modal.classList.add('hidden');
            }
        });
    }
    const activateSearchBtn = document.getElementById('activate-search');
    if (activateSearchBtn) {
        activateSearchBtn.addEventListener('click', function() {
            // Get the SVG element inside the button
            const svgElement = activateSearchBtn.querySelector('svg');
            if (svgElement) {
                // Get the current Stroke value
                const currentStroke = svgElement.getAttribute('stroke');

                if (currentStroke === 'white') {
                    // If the Stroke is white, change it back to the original color
                    svgElement.setAttribute('stroke', '#8198CD');
                    document.getElementById('search-btn-text').style.color = "#8198CD";
                    isSearchActive = false; // Set search active to false
                } else {
                    // Otherwise, change it to white
                    svgElement.setAttribute('stroke', 'white');
                    document.getElementById('search-btn-text').style.color = "white";
                    isSearchActive = true; // Set search active to true
                }
            } else {
                console.error("SVG element inside 'activate-search' button not found.");
            }

            // Get the element with id 'search'
            const searchElement = document.getElementById('search');
            if (searchElement) {
                // Toggle the 'hidden' class to show or hide the element
                searchElement.classList.toggle('hidden');
            } else {
                console.error("Element with id 'search' not found.");
            }

            updateSendButtonState(); // Call the function to update the send button state
        });
    } else {
        console.error("Button with id 'activate-search' not found.");
    }

    if (toggleDiv && toggleCircle && searchModeToggle) {
        toggleDiv.addEventListener('click', () => {
            if (isToggled) {
                // Move circle back to the left and reset background
                toggleCircle.style.transform = 'translateX(10%)';
                toggleDiv.classList.replace('bg-[#8198CD]', 'bg-white'); // Using TailwindCSS classes
                searchModeToggle.checked = false; // Uncheck the checkbox
                document.getElementById("search-company-fields").classList.add("hidden");
                search_query.classList.remove("hidden");
                // console.log("Toggle is off (left side).");
            } else {
                // Move circle to the right and change background
                document.getElementById("search-company-fields").classList.remove("hidden");
                search_query.classList.add("hidden");
                toggleCircle.style.transform = 'translateX(80%)';
                toggleDiv.classList.replace('bg-white', 'bg-[#8198CD]'); // Using TailwindCSS classes
                searchModeToggle.checked = true; // Check the checkbox
                // console.log("Toggle is on (right side).");
            }
            isToggled = !isToggled; // Toggle state

            updateSendButtonState(); // Call the function to update the send button state
        });
    } else {
        console.error("Toggle elements or checkbox not found. Ensure '#toggle', '#toggle-circle', and '#search-mode-toggle' exist.");
    }

    /*if (searchModeToggle.checked == false) {
        search_surname.classList.add("hidden");
        search_name.classList.add("hidden");
        search_mail.classList.add("hidden");
        search_company.classList.add("hidden");
    }*/
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

    // Define separate locking configurations
    const assistantSelectLock = {
        id: 'assistant-select',
        hint: 'Die Auswahl des Assistenten ist nach dem Start eines Chats gesperrt.'
    };

    const sendLockElements = [
        { id: 'send-btn', hint: 'Dieses Element ist gesperrt, während die Antwort generiert wird.' },
        { id: 'user-input', hint: 'Dieses Feld ist gesperrt, während die Antwort generiert wird.' },
        { id: 'activate-search', hint: 'Diese Schaltfläche ist gesperrt, während die Antwort generiert wird.' },
        { id: 'new_chat_entry', hint: 'Diese Schaltfläche ist gesperrt, während die Antwort generiert wird.' },
        { id: 'jobs', hint: 'Diese Schaltfläche ist gesperrt, während die Antwort generiert wird.' },
    ];

    // Function to lock assistant-select
    function lockAssistantSelect() {
        const elem = document.getElementById(assistantSelectLock.id);
        if (elem) {
            elem.disabled = true;

            // Add event listeners for hover to show/hide hints
            elem.addEventListener('mouseenter', showTooltip);
            elem.addEventListener('mouseleave', hideTooltip);
        } else {
            console.error(`Element with id '${assistantSelectLock.id}' not found.`);
        }
    }

    // Function to unlock assistant-select (if needed)
    function unlockAssistantSelect() {
        const elem = document.getElementById(assistantSelectLock.id);
        if (elem) {
            elem.disabled = false;

            // Remove event listeners for hover hints
            elem.removeEventListener('mouseenter', showTooltip);
            elem.removeEventListener('mouseleave', hideTooltip);
        } else {
            console.error(`Element with id '${assistantSelectLock.id}' not found.`);
        }
    }

    // Function to lock elements during message sending
    function lockDuringSend() {
        sendLockElements.forEach(item => {
            const elem = document.getElementById(item.id);
            if (elem) {
                elem.disabled = true;

                // Add event listeners for hover to show/hide hints
                elem.addEventListener('mouseenter', showTooltip);
                elem.addEventListener('mouseleave', hideTooltip);
            } else {
                console.error(`Element with id '${item.id}' not found.`);
            }
        });
    }

    // Function to unlock elements after message sending
    function unlockDuringSend() {
        sendLockElements.forEach(item => {
            const elem = document.getElementById(item.id);
            if (elem) {
                elem.disabled = false;

                // Remove event listeners for hover hints
                elem.removeEventListener('mouseenter', showTooltip);
                elem.removeEventListener('mouseleave', hideTooltip);
            } else {
                console.error(`Element with id '${item.id}' not found.`);
            }
        });
    }

    // Function to lock all chat history entries
    function lockChatHistory() {
        const chatEntries = document.querySelectorAll('.chat_history_entry');
        chatEntries.forEach(entry => {
            entry.classList.add('locked');
        });
    }

    // Function to unlock all chat history entries
    function unlockChatHistory() {
        const chatEntries = document.querySelectorAll('.chat_history_entry');
        chatEntries.forEach(entry => {
            entry.classList.remove('locked');
        });
    }

    // Function to show tooltip using TailwindCSS
    function showTooltip(event) {
        const element = event.currentTarget;
        const hintText = getHintText(element.id);

        if (!hintText) return;

        // Prevent multiple tooltips
        if (document.getElementById('custom-tooltip')) {
            return;
        }

        // Create a tooltip div
        const tooltip = document.createElement('div');
        tooltip.id = 'custom-tooltip';
        tooltip.className = 'absolute bg-black text-white text-xs rounded px-2 py-1 z-50';

        tooltip.innerText = hintText;

        // Calculate position relative to the element
        const rect = element.getBoundingClientRect();
        // Position the tooltip above the element
        tooltip.style.top = `${rect.top - 35}px`; // 35px above
        tooltip.style.left = `${rect.left}px`; // Align to the left

        document.body.appendChild(tooltip);
    }

    // Function to hide tooltip
    function hideTooltip() {
        const tooltip = document.getElementById('custom-tooltip');
        if (tooltip) {
            tooltip.remove();
        }
    }

    // Helper function to get hint text based on element ID
    function getHintText(elementId) {
        // Check assistant-select lock
        if (elementId === assistantSelectLock.id) {
            return assistantSelectLock.hint;
        }

        // Check sendLockElements
        const sendLock = sendLockElements.find(item => item.id === elementId);
        if (sendLock) {
            return sendLock.hint;
        }

        return null;
    }

})();