(function() {
    let selectedImages = null;
    let thread_id = null;
    let assistant_id = "asst_a95l9Zx6anqTbkq07rqHZqnJ"; // Default Assistant ID
    const md = window.markdownit({
        html: false,
        linkify: true,
        typographer: true
    });

    md.renderer.rules.fence = function(tokens, idx) {
        const token = tokens[idx];
        const langClass = token.info ? `language-${token.info}` : '';
        const escapedContent = md.utils.escapeHtml(token.content);
        return `
            <div class="code-block">
                <button class="copy-button">Copy</button>
                <pre class="${langClass}"><code>${escapedContent}</code></pre>
            </div>
        `;
    };

    document.getElementById('send-btn').addEventListener('click', sendMessage);
    document.getElementById('user-input').addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            sendMessage();
            e.preventDefault();
        }
    });
    document.getElementById('image-btn').addEventListener('click', () => {
        document.getElementById('image-input').click();
    });
    document.getElementById('image-input').addEventListener('change', function() {
        const files = this.files;
        if (files.length > 0) {
            selectedImages = files;
            showImageIndicator();
        }
    });

    // Settings modal handlers
    document.getElementById('chatbot-settings-btn').addEventListener('click', openSettingsModal);
    document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
    document.querySelectorAll('.close-button').forEach(btn => {
        btn.onclick = closeModal;
    });

    const assistantSelect = document.getElementById('assistant-select');
    const assistantIdInput = document.getElementById('assistant-id-input');

    // Update the assistant ID input based on the dropdown selection
    assistantSelect.addEventListener('change', function() {
        if (this.value === "other") {
            assistantIdInput.readOnly = false;
            assistantIdInput.value = ""; // Clear the field for custom input
        } else {
            assistantIdInput.readOnly = true;
            assistantIdInput.value = this.value; // Set the value based on the selection
        }
    });

    function openSettingsModal() {
        const settingsModal = document.getElementById('settings-modal');
        assistantIdInput.value = assistant_id; // Set the current assistant ID
        assistantSelect.value = getOptionByValue(assistant_id); // Set the dropdown to match the current ID
        assistantIdInput.readOnly = assistantSelect.value !== "other";
        settingsModal.style.display = 'flex';
    }

    function closeModal() {
        document.getElementById('settings-modal').style.display = 'none';
        document.getElementById('image-modal').style.display = 'none';
    }

    function saveSettings() {
        const selectedValue = assistantSelect.value;
        if (selectedValue === "other") {
            const newAssistantId = assistantIdInput.value.trim();
            if (newAssistantId) {
                assistant_id = newAssistantId;
                alert('Assistant ID updated successfully!');
                closeModal();
            } else {
                alert('Please enter a valid Assistant ID.');
            }
        } else {
            assistant_id = selectedValue;
            alert('Assistant ID updated successfully!');
            closeModal();
        }
    }

    function getOptionByValue(value) {
        // Match the assistant ID with the dropdown options
        const options = assistantSelect.options;
        for (let i = 0; i < options.length; i++) {
            if (options[i].value === value) {
                return options[i].value;
            }
        }
        return "other";
    }

    function copyToClipboard(element) {
        if (element.readOnly) {
            navigator.clipboard.writeText(element.value).then(() => {
                alert('Copied to clipboard: ' + element.value);
            }).catch(err => {
                console.error('Failed to copy: ', err);
            });
        }
    }

    function sendMessage() {
        const userInput = document.getElementById('user-input').value.trim();

        if (selectedImages && selectedImages.length > 0) {
            const imageURLs = Array.from(selectedImages).map(file => URL.createObjectURL(file));
            displayMessage('User', userInput, imageURLs);
            sendImagesToAPI(selectedImages, userInput);
        } else if (userInput) {
            displayMessage('User', userInput);
            sendMessageToAPI(userInput);
        }
        document.getElementById('user-input').value = '';
        document.getElementById('image-input').value = '';
        selectedImages = null;
        hideImageIndicator();
    }

    function sendMessageToAPI(message) {
        displayLoader();
        const payload = {
            user_id: 1,
            message: message,
            assistant_id: assistant_id,
            thread_id: thread_id
        };

        fetch('/chat/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        })
        .then(response => response.json())
        .then(data => {
            removeLoader();
            if (data.message) {
                displayMessage('Bot', data.message);
            }
            if (data.thread_id) {
                thread_id = data.thread_id;
            }
        })
        .catch(error => {
            removeLoader();
            console.error('Error:', error);
            displayMessage('Bot', 'Es gab ein Problem bei der Kommunikation mit dem Bot.');
        });
    }

    function sendImagesToAPI(imageFiles, prompt) {
        displayLoader();
        const formData = new FormData();
        for (let i = 0; i < imageFiles.length; i++) {
            formData.append('images', imageFiles[i]);
        }
        formData.append('prompt', prompt || "No prompt provided.");

        fetch('/process_image/', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            removeLoader();
            if (data.response) {
                displayMessage('Bot', data.response);
            } else {
                displayMessage('Bot', 'Keine gültige Antwort vom Bot erhalten.');
            }
        })
        .catch(error => {
            removeLoader();
            console.error('Error:', error);
            displayMessage('Bot', 'Es gab ein Problem bei der Bildverarbeitung.');
        });
    }

    function displayMessage(sender, message, imageURLs = null) {
        const messagesDiv = document.getElementById('messages');
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', sender.toLowerCase());
        let parsedMessage = md.render(message);
        parsedMessage = DOMPurify.sanitize(parsedMessage);

        let imageHTML = '';
        if (imageURLs && imageURLs.length > 0) {
            imageHTML = imageURLs.map(url => `<img src="${url}" alt="User Image" class="message-image" draggable="false">`).join('');
        }

        messageDiv.innerHTML = `
            <img src="/static/images/${sender.toLowerCase()}-icon.png" alt="${sender} Icon" draggable="false">
            <div class="message-content">
                ${parsedMessage}
                ${imageHTML}
            </div>
        `;
        messagesDiv.appendChild(messageDiv);

        messageDiv.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });

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
        setTimeout(() => {
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }, 100);
    }

    function displayLoader() {
        const messagesDiv = document.getElementById('messages');
        const loaderDiv = document.createElement('div');
        loaderDiv.classList.add('message', 'bot');
        loaderDiv.innerHTML = `<div class="loader"></div>`;
        loaderDiv.id = 'loader';
        messagesDiv.appendChild(loaderDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    function removeLoader() {
        const loaderDiv = document.getElementById('loader');
        if (loaderDiv) {
            loaderDiv.remove();
        }
    }

    function openModal(imageSrc) {
        const modal = document.getElementById('image-modal');
        const modalImg = document.getElementById('full-image');
        modal.style.display = 'flex';
        modalImg.src = imageSrc;
    }

    function showImageIndicator() {
        const indicator = document.getElementById('image-selected-indicator');
        if (indicator) {
            indicator.style.display = 'block';
        }
    }

    function hideImageIndicator() {
        const indicator = document.getElementById('image-selected-indicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    }

    function adjustChatbotIcon() {
        const chatbotIcon = document.getElementById('chatbot-icon');
        const windowWidth = window.innerWidth;

        if (windowWidth < 600) {
            chatbotIcon.style.width = '40px';
            chatbotIcon.style.height = '40px';
            chatbotIcon.style.bottom = '10px';
            chatbotIcon.style.right = '10px';
        } else if (windowWidth >= 600 && windowWidth < 1200) {
            chatbotIcon.style.width = '50px';
            chatbotIcon.style.height = '50px';
            chatbotIcon.style.bottom = '15px';
            chatbotIcon.style.right = '15px';
        } else {
            chatbotIcon.style.width = '60px';
            chatbotIcon.style.height = '60px';
            chatbotIcon.style.bottom = '20px';
            chatbotIcon.style.right = '20px';
        }
    }

    function disableImageDraggingAndContextMenu() {
        const images = document.querySelectorAll('img');
        images.forEach(img => {
            img.setAttribute('draggable', 'false');
            img.addEventListener('contextmenu', function(e) {
                e.preventDefault();
            });
        });
    }

    window.addEventListener('resize', adjustChatbotIcon);
    window.addEventListener('load', () => {
        adjustChatbotIcon();
        disableImageDraggingAndContextMenu();
        displayMessage('Bot', 'Hallo, wie kann ich Ihnen heute helfen?');
    });
})();
