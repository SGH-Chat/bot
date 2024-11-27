// jobs.js 

(async function () {
    const userApiKey = 'b9527153-d056-4abf-af60-b8b7f5835a94';
    const chatBtn = document.getElementById('chat-btn');
    if (chatBtn) {
        chatBtn.addEventListener('click', function () {
            window.location.href = '/'; // Navigate to /
        });
    } else {
        console.error("Button with id 'chat-btn' not found.");
    }

    const batchesContainer = document.getElementById('batches');
    const batchHistory = document.getElementById('batch_history');
    const sendRequestButton = document.getElementById('send-request');
    const maxTokensInput = document.getElementById('max_tokens');

    // Create modal overlay
    const createModalOverlay = () => {
        const overlay = document.createElement('div');
        overlay.id = 'modal-overlay';
        overlay.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center hidden z-50';
        document.body.appendChild(overlay);
        return overlay;
    };

    const modalOverlay = createModalOverlay();

    // Expand functionality
    const expandTextarea = (textarea) => {
        // Ensure modal dimensions are restricted to the parent container size
        const modalContent = document.createElement('div');
        modalContent.className = `
            relative
            bg-gray-600
            text-white
            border border-gray-500
            rounded-xl
            p-4
            overflow-hidden
            flex
            flex-col
        `;
        modalContent.style.width = '100%'; // Take full width of the parent
        modalContent.style.height = '100%'; // Take full height of the parent
        modalContent.style.maxWidth = 'calc(100vw - 20%)'; // Maximum width restricted to viewport minus padding
        modalContent.style.maxHeight = 'calc(100vh - 20%)'; // Maximum height restricted to viewport minus padding
    
        modalOverlay.innerHTML = '';
        modalOverlay.appendChild(modalContent);
    
        // Clone the textarea into the modal
        const expandedTextarea = textarea.cloneNode(true);
        expandedTextarea.className = `
            w-full          /* Full width of the modal */
            h-full          /* Full height of the modal */
            p-4
            bg-gray-600
            text-white
            rounded
            resize-none
        `;
        expandedTextarea.style.maxWidth = '100%'; // Ensure it doesn't exceed the modal width
        expandedTextarea.style.maxHeight = '100%'; // Ensure it doesn't exceed the modal height
        expandedTextarea.value = textarea.value; // Sync value
        expandedTextarea.addEventListener('input', (event) => {
            textarea.value = event.target.value; // Sync changes back to original
        });
        modalContent.appendChild(expandedTextarea);
    
        // Add shrink button
        const shrinkButton = document.createElement('button');
        shrinkButton.className = `
            absolute
            top-2
            right-2
            w-8
            h-8
            flex
            items-center
            justify-center
            rounded-full
            hover:bg-gray-800
            focus:outline-none
            focus:ring-2
            focus:ring-gray-500
        `;
        shrinkButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="#8198CD" class="w-6 h-6">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
            </svg>
        `;
        shrinkButton.addEventListener('click', () => {
            modalOverlay.classList.add('hidden');
            modalOverlay.innerHTML = '';
        });
        modalContent.appendChild(shrinkButton);
    
        modalOverlay.classList.remove('hidden');
    };
    
    
    // Function to fetch and display all batches
    async function fetchAndDisplayBatches() {
        try {
            const response = await fetch('/api/batch/list/', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': userApiKey,
                },
            });

            if (!response.ok) {
                console.error('Error fetching batches:', response.statusText);
                return;
            }

            const data = await response.json();
            displayBatchHistory(data.batches || []);
        } catch (error) {
            console.error('Error fetching batch history:', error);
        }
    }

    // Function to display batch history
    function displayBatchHistory(batches) {
        batchHistory.innerHTML = ''; // Clear existing entries

        batches.forEach((batch) => {
            const batchDiv = document.createElement('div');
            batchDiv.classList.add(
                'border', 'border-gray-400', 'p-2', 'cursor-pointer',
                'hover:bg-gray-700', 'rounded-xl', 'batch-history-entry'
            );

            batchDiv.dataset.batchId = batch.batch_id;

            const status = batch.finished
                ? 'Finished'
                : batch.canceled
                ? 'Canceled'
                : 'In Progress';

            batchDiv.innerHTML = `
                <div class="text-white overflow-x-hidden">
                    <div id="batch_id"><p class="text-md w-[70%] mx-auto overflow-x-hidden">${batch.batch_id}</p></div>
                    <p class="text-sm text-gray-300">
                        Created: ${new Date(batch.created_at).toLocaleString()}<br>
                    </p>
                    <p class="text-sm text-gray-400">Status: ${batch.status}</p>
                </div>
            `;
            

            batchDiv.addEventListener('click', () => loadBatchContent(batch.batch_id));
            batchHistory.appendChild(batchDiv);
        });
    }

    // Function to load and display batch content
    async function loadBatchContent(batchId) {
        try {
            const response = await fetch('/api/batch/requests/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': userApiKey,
                },
                body: JSON.stringify({ batch_id: batchId }),
            });

            if (!response.ok) {
                console.error('Error fetching batch content:', response.statusText);
                return;
            }

            const data = await response.json();
            console.log(data)
            displayBatchContent(data.requests || []);
        } catch (error) {
            console.error('Error loading batch content:', error);
        }
    }
    function displayBatchContent(requests) {
        removeSendRequestBtn()
        removeAddBatchRowBtn()
        const batchMessages = document.getElementById('batches');
        batchMessages.innerHTML = ''; // Clear existing content
    
        requests.forEach((request) => {
            // Create a new row container
            const newRow = document.createElement('div');
            newRow.className = 'flex flex-col items-start space-y-4 batch-row';
    
            // --- Top Row Container ---
            const topRow = document.createElement('div');
            topRow.className = 'flex flex-row items-center space-x-4 w-full';
    
            // Model select with label
            const selectContainer = document.createElement('div');
            selectContainer.className = 'flex flex-col items-start';
    
            const selectLabel = document.createElement('label');
            selectLabel.textContent = 'Model:';
            selectLabel.className = 'text-white text-sm mb-1';
            selectContainer.appendChild(selectLabel);
    
            const select = document.createElement('select');
            select.name = 'model';
            select.className = 'p-2 bg-gray-600 text-white border border-gray-500 rounded';
            select.innerHTML = `
                <option value="gpt-4o" ${request.model === 'gpt-4o' ? 'selected' : ''}>GPT-4o</option>
                <option value="gpt-4o-mini" ${request.model === 'gpt-4o-mini' ? 'selected' : ''}>GPT-4o mini</option>
                <option value="o1-preview" ${request.model === 'o1-preview' ? 'selected' : ''}>o1-preview</option>
                <option value="o1-mini" ${request.model === 'o1-mini' ? 'selected' : ''}>o1-mini</option>
            `;
            selectContainer.appendChild(select);
    
            // System instructions with label
            const systemContainer = document.createElement('div');
            systemContainer.className = 'flex flex-col items-start flex-grow w-full ';
    
            const systemLabel = document.createElement('label');
            systemLabel.textContent = 'System:';
            systemLabel.className = 'text-white text-sm mb-1';
            systemContainer.appendChild(systemLabel);
    
            const systemTextareaContainer = document.createElement('div');
            systemTextareaContainer.className = 'flex items-center space-x-2 bg-gray-600 text-white border border-gray-500 rounded px-2 w-full ';
    
            const system = document.createElement('textarea');
            system.name = 'system';
            system.placeholder = 'System...';
            system.className = 'w-full p-2 bg-gray-600 text-white rounded resize-none';
            system.value = request.system_instructions || '';
    
            const expandSystemBtn = document.createElement('button');
            expandSystemBtn.type = 'button';
            expandSystemBtn.className = 'w-6 h-6 flex items-center justify-center';
            expandSystemBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="#8198CD" class="w-5 h-5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5M3.75 3.75L9 9M3.75 20.25v-4.5m0 4.5h4.5M3.75 20.25L9 15M20.25 3.75h-4.5m4.5 0v4.5M20.25 3.75L15 9m5.25 11.25h-4.5m4.5 0v-4.5M20.25 20.25L15 15" />
                </svg>
            `;
            expandSystemBtn.addEventListener('click', () => expandTextarea(system));
    
            systemTextareaContainer.appendChild(system);
            systemTextareaContainer.appendChild(expandSystemBtn);
            systemContainer.appendChild(systemTextareaContainer);
    
            // User message with label
            const messageContainer = document.createElement('div');
            messageContainer.className = 'flex flex-col items-start flex-grow w-full ';
    
            const messageLabel = document.createElement('label');
            messageLabel.textContent = 'User:';
            messageLabel.className = 'text-white text-sm mb-1';
            messageContainer.appendChild(messageLabel);
    
            const messageTextareaContainer = document.createElement('div');
            messageTextareaContainer.className = 'flex items-center space-x-2 bg-gray-600 text-white border border-gray-500 rounded px-2 w-full';
    
            const input = document.createElement('textarea');
            input.name = 'message';
            input.placeholder = 'Message...';
            input.className = 'w-full p-2 bg-gray-600 text-white rounded resize-none';
            input.value = request.user_message || '';
    
            const expandInputBtn = document.createElement('button');
            expandInputBtn.type = 'button';
            expandInputBtn.className = 'w-6 h-6 flex items-center justify-center';
            expandInputBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="#8198CD" class="w-5 h-5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5M3.75 3.75L9 9M3.75 20.25v-4.5m0 4.5h4.5M3.75 20.25L9 15M20.25 3.75h-4.5m4.5 0v4.5M20.25 3.75L15 9m5.25 11.25h-4.5m4.5 0v-4.5M20.25 20.25L15 15" />
                </svg>
            `;
            expandInputBtn.addEventListener('click', () => expandTextarea(input));
    
            messageTextareaContainer.appendChild(input);
            messageTextareaContainer.appendChild(expandInputBtn);
            messageContainer.appendChild(messageTextareaContainer);
    
            // Add containers to the topRow
            topRow.appendChild(selectContainer);
            topRow.appendChild(systemContainer);
            topRow.appendChild(messageContainer);
    
            // --- Assistant Container ---
            const assistantContainer = document.createElement('div');
            assistantContainer.className = 'flex flex-col items-start w-full mb-5';
    
            const assistantLabel = document.createElement('label');
            assistantLabel.textContent = 'Assistant:';
            assistantLabel.className = 'text-white text-sm mb-1';
            assistantContainer.appendChild(assistantLabel);
    
            const assistantTextareaContainer = document.createElement('div');
            assistantTextareaContainer.className = 'flex items-center space-x-2 bg-gray-600 text-white border border-gray-500 rounded px-2 w-full ';
    
            const assistant = document.createElement('textarea');
            assistant.name = 'assistant';
            assistant.placeholder = 'Assistant...';
            assistant.className = 'w-full p-2 bg-gray-600 text-white rounded resize-none';
            assistant.value = request.assistant_message || '';
    
            const expandAssistantBtn = document.createElement('button');
            expandAssistantBtn.type = 'button';
            expandAssistantBtn.className = 'w-6 h-6 flex items-center justify-center';
            expandAssistantBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="#8198CD" class="w-5 h-5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5M3.75 3.75L9 9M3.75 20.25v-4.5m0 4.5h4.5M3.75 20.25L9 15M20.25 3.75h-4.5m4.5 0v-4.5M20.25 3.75L15 9m5.25 11.25h-4.5m4.5 0v-4.5M20.25 20.25L15 15" />
                </svg>
            `;
            expandAssistantBtn.addEventListener('click', () => expandTextarea(assistant));
    
            assistantTextareaContainer.appendChild(assistant);
            assistantTextareaContainer.appendChild(expandAssistantBtn);
            assistantContainer.appendChild(assistantTextareaContainer);
    
            // Make fields read-only and allow content selection
            [select, system, input, assistant].forEach((field) => {
                if (field.tagName.toLowerCase() === 'textarea') {
                    field.readOnly = true;
                } else {
                    field.disabled = true;
                }
                field.title = 'Editing is disabled while a batch is loaded.';
            });
    
            // Append the topRow and assistant container to the newRow
            newRow.appendChild(topRow);
            newRow.appendChild(assistantContainer);
    
            // Append the newRow to the batchMessages container
            batchMessages.appendChild(newRow);
        });
    }    
    

    function resetBatch() {
        addSendRequestBtn()
        const batches = document.getElementById('batches');
        batches.innerHTML = ''; // Clear all rows
    
        // Add a new empty row
        addBatchRow();
    
        // Recreate the "Add Batch" button
        const addBatchButton = document.createElement('button');
        addBatchButton.id = 'add-batch';
        addBatchButton.className = 'w-10 h-10 bg-gray-700 flex items-center justify-center rounded-full hover:shadow hover:scale-110 transition mr-auto ml-auto';
        addBatchButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="white" class="size-6 w-6 h-6">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
        `;
        addBatchButton.addEventListener('click', () => {
            addBatchRow();
        });
    
        // Append the "Add Batch" button back to the container
        addAddBatchRowBtn()
    }
    
    // Attach the "New Batch" event listener
    document.getElementById('new_batch').addEventListener('click', resetBatch);
    
    // Function to send batch requests
    async function sendBatchRequests() {
        const rows = document.querySelectorAll('.batch-row');
        const requests = [];

        rows.forEach((row) => {
            const model = row.querySelector('select[name="model"]').value;
            const system = row.querySelector('textarea[name="system"]').value;
            const message = row.querySelector('textarea[name="message"]').value;

            requests.push({ model, system, user: message });
        });

        const maxTokens = parseInt(maxTokensInput.value, 10) || 10240;

        try {
            const response = await fetch('/api/batch/create/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': userApiKey,
                },
                body: JSON.stringify({
                    requests,
                    description: 'Batch created from jobs.html',
                    max_tokens: maxTokens,
                }),
            });

            if (!response.ok) {
                console.error('Error creating batch:', response.statusText);
                return;
            }

            const data = await response.json();
            console.log('Batch created successfully:', data);
            fetchAndDisplayBatches(); // Refresh batch history
        } catch (error) {
            console.error('Error sending batch requests:', error);
        }
    }

    // Function to update the state of remove buttons
    function updateRemoveButtonStates() {
        const rows = document.querySelectorAll('.batch-row');
        const removeButtons = document.querySelectorAll('.remove-btn');

        removeButtons.forEach((btn) => {
            if (rows.length === 1) {
                btn.disabled = true;
                btn.classList.add('opacity-50', 'cursor-not-allowed');
                btn.querySelector('svg').style.stroke = 'rgba(255, 102, 102, 0.5)';
            } else {
                btn.disabled = false;
                btn.classList.remove('opacity-50', 'cursor-not-allowed');
                btn.querySelector('svg').style.stroke = 'rgb(255, 102, 102)';
            }
        });
    }

    // Function to add a new row
    function addBatchRow() {
        const newRow = document.createElement('div');
        newRow.className = 'flex flex-row items-center space-x-4 batch-row';

        const select = document.createElement('select');
        select.name = 'model';
        select.className = 'p-2 bg-gray-600 text-white border border-gray-500 rounded';
        select.innerHTML = `
            <option value="gpt-4o">GPT-4o</option>
            <option value="gpt-4o-mini">GPT-4o mini</option>
            <option value="o1-preview">o1-preview</option>
            <option value="o1-mini">o1-mini</option>
        `;

        const system = document.createElement('textarea');
        system.name = 'system';
        system.placeholder = 'System...';
        system.className = 'flex-grow p-2 bg-gray-600 text-white rounded resize-none';

        const input = document.createElement('textarea');
        input.name = 'message';
        input.placeholder = 'Message...';
        input.className = 'flex-grow p-2 bg-gray-600 text-white rounded resize-none';

        const expandSystemBtn = document.createElement('button');
        expandSystemBtn.type = 'button';
        expandSystemBtn.className = 'mr-5';
        expandSystemBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="#8198CD" class="w-6 h-6">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
        `;
        expandSystemBtn.addEventListener('click', () => expandTextarea(system));

        const expandInputBtn = document.createElement('button');
        expandInputBtn.type = 'button';
        expandInputBtn.className = 'mr-5';
        expandInputBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="#8198CD" class="w-6 h-6">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
        `;
        expandInputBtn.addEventListener('click', () => expandTextarea(input));


        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove-btn w-8 h-8 border border-transparent rounded-full flex items-center justify-center hover:shadow transition';
        removeBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="rgb(255, 102, 102)" class="size-6 w-5 h-5">
                <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
        `;
        removeBtn.addEventListener('click', function () {
            newRow.remove();
            updateRemoveButtonStates();
        });

        const inputContainer = document.createElement('div');
        inputContainer.className = 'flex-grow flex items-center space-x-2 bg-gray-600 text-white border border-gray-500 rounded resize-none px-2';
        inputContainer.appendChild(system);
        inputContainer.appendChild(expandSystemBtn);

        const messageContainer = document.createElement('div');
        messageContainer.className = 'flex-grow flex items-center space-x-2 bg-gray-600 text-white border border-gray-500 rounded resize-none px-2';
        messageContainer.appendChild(input);
        messageContainer.appendChild(expandInputBtn);

        newRow.appendChild(select);
        newRow.appendChild(inputContainer);
        newRow.appendChild(messageContainer);
        newRow.appendChild(removeBtn);

        batchesContainer.appendChild(newRow);
        updateRemoveButtonStates();
    }

    // Add event listeners
    document.getElementById('add-batch').addEventListener('click', addBatchRow);
    sendRequestButton.addEventListener('click', sendBatchRequests);

    // Initialize the page
    window.addEventListener('load', () => {
        addBatchRow();
        fetchAndDisplayBatches();
    });

    // Max tokens adjustment logic remains unchanged
    if (maxTokensInput) {
        // Initialize default value
        maxTokensInput.value = 10240;
    
        // Function to adjust the value with constraints
        const adjustMaxTokens = (increment) => {
            let currentValue = parseInt(maxTokensInput.value, 10) || 10240;
            currentValue += increment;
    
            // Apply boundaries
            if (currentValue > 128000) currentValue = 128000;
            if (currentValue < 8192) currentValue = 8192;
    
            maxTokensInput.value = currentValue;
        };
    
        // Handle mouse wheel events
        maxTokensInput.addEventListener('wheel', (event) => {
            event.preventDefault();
            const increment = event.deltaY < 0 ? 1024 : -1024; // Scroll up: increment, Scroll down: decrement
            adjustMaxTokens(increment);
        });
    
        // Handle arrow key events
        maxTokensInput.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowUp') {
                event.preventDefault();
                adjustMaxTokens(1024); // Increment by 1024
            } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                adjustMaxTokens(-1024); // Decrement by 1024
            }
        });
    
        // Ensure value stays within bounds on blur
        maxTokensInput.addEventListener('blur', () => {
            let value = parseInt(maxTokensInput.value, 10) || 10240;
            if (value > 128000) value = 128000;
            if (value < 8192) value = 8192;
            maxTokensInput.value = value;
        });
    }
    function removeSendRequestBtn() {
        const sendRequestBtn = document.getElementById('send-request');
        if (sendRequestBtn) {
            sendRequestBtn.style.display = 'none'; // Hide the button
        }
    }
    
    // Function to add and show the "Send Request" button
    function addSendRequestBtn() {
        const sendRequestBtn = document.getElementById('send-request');
        if (sendRequestBtn) {
            sendRequestBtn.style.display = 'block'; // Show the button
        }
    }    
    function removeAddBatchRowBtn() {
        const sendRequestBtn = document.getElementById('add-batch');
        if (sendRequestBtn) {
            sendRequestBtn.style.display = 'none'; // Hide the button
        }
    }
    
    // Function to add and show the "Send Request" button
    function addAddBatchRowBtn() {
        const sendRequestBtn = document.getElementById('add-batch');
        if (sendRequestBtn) {
            sendRequestBtn.style.display = 'inline-flex'; // Show the button
        }
    }    
})();
