document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("expense-form");
    const categoryList = document.getElementById("category-list");
    const totalAmount = document.getElementById("total-amount");
    const categorySelect = document.getElementById("expense-category");
    const newCategoryInput = document.getElementById("new-category");
    const chartContainer = document.getElementById("chart-container");
    const timeRangeFilter = document.getElementById("time-range");
    const searchInput = document.getElementById("search-expenses");
    const budgetForm = document.getElementById("budget-form");
    const themeToggle = document.getElementById("theme-toggle");
    const clearAllBtn = document.getElementById("clear-all");
    const dateInput = document.getElementById("expense-date");
    const statsSummary = document.getElementById("stats-summary");
    const viewToggle = document.getElementById("view-toggle");
    
    dateInput.valueAsDate = new Date();

    let expenses = JSON.parse(localStorage.getItem("expenses")) || {};
    let budgets = JSON.parse(localStorage.getItem("budgets")) || {};
    let total = parseFloat(localStorage.getItem("totalExpense")) || 0;
    let currentChart = null;
    let savedChartData = null;
    let currentView = "categories";

    const savedTheme = localStorage.getItem("theme") || "light";
    document.body.classList.add(savedTheme);
    
    const chartColors = [
        "#ff6384", "#36a2eb", "#ffcd56", "#4bc0c0", 
        "#9966ff", "#c9cbcf", "#ff9f40", "#4d5360",
        "#46BFBD", "#F7464A", "#949FB1", "#57A773"
    ];

    let chartData = {
        labels: [],
        datasets: [{
            data: [],
            backgroundColor: chartColors
        }]
    };

    let expenseChart;

    loadExpenses();
    updateUI();
    updateChart();
    updateStatistics();

    categorySelect.addEventListener("change", function () {
        newCategoryInput.style.display =
            categorySelect.value === "Add-category" ? "block" : "none";
    });

    form.addEventListener("submit", function (event) {
        event.preventDefault();
        const name = document.getElementById("expense-name").value.trim();
        const amount = parseFloat(document.getElementById("expense-amount").value);
        let category = categorySelect.value;
        const date = dateInput.value ? new Date(dateInput.value) : new Date();
        const notes = document.getElementById("expense-notes").value.trim();

        if (!name || isNaN(amount) || amount <= 0) {
            showNotification("Please enter a valid expense name and amount", "error");
            return;
        }

        if (category === "Add-category") {
            category = newCategoryInput.value.trim();
            if (!category) {
                showNotification("Please enter a category name", "error");
                return;
            }

            if (expenses[category]) {
                showNotification("Category already exists", "error");
                return;
            }

            const option = document.createElement("option");
            option.value = category;
            option.textContent = category;
            categorySelect.insertBefore(option, categorySelect.lastElementChild);
            categorySelect.value = category;
            newCategoryInput.value = "";
            newCategoryInput.style.display = "none";
        }

        if (!expenses[category]) {
            expenses[category] = { items: [], total: 0 };
            addCategoryToList(category);
        }

        const timestamp = date.toISOString();
        const expenseId = Date.now().toString();
        const newExpense = { 
            id: expenseId,
            name, 
            amount, 
            timestamp,
            notes,
            formattedDate: date.toLocaleDateString(),
            recurrence: document.getElementById("expense-recurrence").value
        };
        
        expenses[category].items.push(newExpense);
        expenses[category].total += amount;
        total += amount;

        updateUI();
        updateCategoryTotal(category);
        updateChart();
        updateStatistics();
        saveExpenses();

        checkBudgetAlert(category);
        
        form.reset();
        dateInput.valueAsDate = new Date();
        showNotification("Expense added successfully!", "success");
    });

    if (budgetForm) {
        budgetForm.addEventListener("submit", function(event) {
            event.preventDefault();
            const category = document.getElementById("budget-category").value;
            const amount = parseFloat(document.getElementById("budget-amount").value);
            
            if (!category || isNaN(amount) || amount <= 0) {
                showNotification("Please enter valid budget information", "error");
                return;
            }
            
            budgets[category] = amount;
            localStorage.setItem("budgets", JSON.stringify(budgets));
            updateBudgetDisplay();
            showNotification(`Budget set for ${category}`, "success");
            budgetForm.reset();
        });
    }

    if (themeToggle) {
        themeToggle.addEventListener("click", function() {
            document.body.classList.toggle("dark");
            document.body.classList.toggle("light");
            const currentTheme = document.body.classList.contains("dark") ? "dark" : "light";
            localStorage.setItem("theme", currentTheme);
        });
    }

    if (searchInput) {
        searchInput.addEventListener("input", function() {
            filterExpenses(this.value);
        });
    }

    if (timeRangeFilter) {
        timeRangeFilter.addEventListener("change", function() {
            updateChart();
            updateCategoryList();
            updateStatistics();
        });
    }

    if (clearAllBtn) {
        clearAllBtn.addEventListener("click", function() {
            if (confirm("Are you sure you want to clear all expense data? This cannot be undone.")) {
                localStorage.removeItem("expenses");
                localStorage.removeItem("totalExpense");
                expenses = {};
                total = 0;
                categoryList.innerHTML = "";
                updateUI();
                updateChart();
                updateStatistics();
                showNotification("All data cleared", "info");
            }
        });
    }

    if (viewToggle) {
        viewToggle.addEventListener("click", function() {
            currentView = currentView === "categories" ? "timeline" : "categories";
            viewToggle.textContent = currentView === "categories" ? "View Timeline" : "View Categories";
            updateChart();
        });
    }

    function addCategoryToList(category) {
        const li = document.createElement("li");
        li.classList.add("category-item");
        li.innerHTML = `
            <div class="category-header">
                <span>${category}: $0.00</span>
                <button class="delete-category" data-category="${category}">✕</button>
            </div>
        `;
        li.dataset.category = category;
        
        li.addEventListener("mouseenter", function () {
            showCategoryBreakdown(category);
        });
        
        li.addEventListener("mouseleave", function () {
            restoreMainChart();
        });
        
        li.addEventListener("click", function (e) {
            if (e.target.classList.contains("delete-category")) {
                deleteCategory(category);
                return;
            }
            
            if (e.target.tagName === 'LI' && e.target.classList.contains("expense-item")) return;
            toggleCategoryView(category, li);
        });
        
        categoryList.appendChild(li);

        if (budgets[category]) {
            updateBudgetProgress(category);
        }
    }

    function deleteCategory(category) {
        if (!confirm(`Delete category "${category}" and all its expenses?`)) return;

        total -= expenses[category].total;

        delete expenses[category];

        const categoryElement = document.querySelector(`[data-category="${category}"]`);
        if (categoryElement) {
            categoryElement.remove();
        }

        const option = Array.from(categorySelect.options).find(opt => opt.value === category);
        if (option) {
            categorySelect.removeChild(option);
        }

        if (budgets[category]) {
            delete budgets[category];
            localStorage.setItem("budgets", JSON.stringify(budgets));
        }
        
        updateUI();
        updateChart();
        updateStatistics();
        saveExpenses();
        showNotification(`Category "${category}" deleted`, "info");
    }

    function toggleCategoryView(category, categoryElement) {
        let ul = categoryElement.querySelector(".expense-list");
        if (!ul) {
            ul = document.createElement("ul");
            ul.classList.add("expense-list");
        } else {
            ul.classList.toggle("hidden");
            return;
        }
        
        ul.innerHTML = "";

        expenses[category].items.forEach(expense => {
            const expenseLi = document.createElement("li");
            expenseLi.classList.add("expense-item");
            expenseLi.innerHTML = `
                <div class="expense-info">
                    <span class="expense-name">${expense.name}: $${expense.amount.toFixed(2)}</span>
                    <span class="expense-date">${expense.formattedDate}</span>
                    ${expense.notes ? `<div class="expense-notes">${expense.notes}</div>` : ''}
                    ${expense.recurrence !== "none" ? `<div class="recurrence-badge">${expense.recurrence}</div>` : ''}
                </div>
                <button class="delete-expense" data-id="${expense.id}" data-category="${category}">✕</button>
            `;
            
            expenseLi.querySelector(".delete-expense").addEventListener("click", function(e) {
                e.stopPropagation();
                deleteExpense(category, expense.id);
            });
            
            ul.appendChild(expenseLi);
        });

        categoryElement.appendChild(ul);
        ul.classList.toggle("hidden");
    }

    function deleteExpense(category, expenseId) {
        if (!confirm("Delete this expense?")) return;
        
        const expenseIndex = expenses[category].items.findIndex(item => item.id === expenseId);
        if (expenseIndex === -1) return;
        
        const expenseAmount = expenses[category].items[expenseIndex].amount;

        expenses[category].items.splice(expenseIndex, 1);

        expenses[category].total -= expenseAmount;
        total -= expenseAmount;

        if (expenses[category].items.length === 0) {
            deleteCategory(category);
        } else {
            updateCategoryTotal(category);

            const categoryElement = document.querySelector(`[data-category="${category}"]`);
            const expenseList = categoryElement.querySelector(".expense-list");
            if (expenseList && !expenseList.classList.contains("hidden")) {
                toggleCategoryView(category, categoryElement);
                toggleCategoryView(category, categoryElement);
            }
        }
        
        updateUI();
        updateChart();
        updateStatistics();
        saveExpenses();
        showNotification("Expense deleted", "info");
    }

    function updateCategoryTotal(category) {
        const categoryItem = document.querySelector(`[data-category="${category}"] .category-header span`);
        if (categoryItem) {
            categoryItem.textContent = `${category}: $${expenses[category].total.toFixed(2)}`;

          if (budgets[category]) {
              updateBudgetProgress(category);
          }
        }
    }
    function updateBudgetProgress(category) {
        const categoryItem = document.querySelector(`[data-category="${category}"]`);
        if (!categoryItem) return;

        const existingBar = categoryItem.querySelector(".budget-progress");
        if (existingBar) {
            existingBar.remove();
        }
        
        const budget = budgets[category];
        const spent = expenses[category].total;
        const percentage = Math.min((spent / budget) * 100, 100);
        
        const progressBar = document.createElement("div");
        progressBar.classList.add("budget-progress");
        progressBar.innerHTML = `
            <div class="progress-bar">
                <div class="progress" style="width: ${percentage}%"></div>
            </div>
            <div class="budget-text">Budget: $${budget.toFixed(2)} (${percentage.toFixed(0)}% used)</div>
        `;

        if (percentage > 80) {
            progressBar.querySelector(".progress").classList.add("warning");
        }

        const categoryHeader = categoryItem.querySelector(".category-header");
        categoryHeader.insertAdjacentElement("afterend", progressBar);
    }

    function updateBudgetDisplay() {
        for (const category in budgets) {
            if (expenses[category]) {
                updateBudgetProgress(category);
            }
        }
    }

    function checkBudgetAlert(category) {
        if (!budgets[category]) return;
        
        const budget = budgets[category];
        const spent = expenses[category].total;
        const percentage = (spent / budget) * 100;
        
        if (percentage >= 90) {
            showNotification(`Warning: You've used ${percentage.toFixed(0)}% of your ${category} budget!`, "warning");
        }
    }

    function updateUI() {
        totalAmount.textContent = `$${total.toFixed(2)}`;
        updateBudgetDisplay();
    }

    function updateCategoryList() {
        categoryList.innerHTML = "";
        
        const filteredExpenses = filterExpensesByTime();
        
        for (const category in filteredExpenses) {
            addCategoryToList(category);
            updateCategoryTotal(category);
        }
    }

    function filterExpensesByTime() {
        if (!timeRangeFilter || timeRangeFilter.value === "all") {
            return expenses;
        }
        
        const now = new Date();
        const filtered = {};
        let cutoffDate;
        
        switch(timeRangeFilter.value) {
            case "today":
                cutoffDate = new Date(now.setHours(0, 0, 0, 0));
                break;
            case "week":
                cutoffDate = new Date(now.setDate(now.getDate() - 7));
                break;
            case "month":
                cutoffDate = new Date(now.setMonth(now.getMonth() - 1));
                break;
            case "year":
                cutoffDate = new Date(now.setFullYear(now.getFullYear() - 1));
                break;
            default:
                return expenses;
        }
        
        for (const category in expenses) {
            const items = expenses[category].items.filter(item => {
                const itemDate = new Date(item.timestamp);
                return itemDate >= cutoffDate;
            });
            
            if (items.length > 0) {
                const categoryTotal = items.reduce((sum, item) => sum + item.amount, 0);
                filtered[category] = {
                    items: items,
                    total: categoryTotal
                };
            }
        }
        
        return filtered;
    }

    function updateChart() {
        const filteredExpenses = filterExpensesByTime();
        
        if (currentView === "categories") {
            chartData.labels = Object.keys(filteredExpenses);
            chartData.datasets[0].data = Object.values(filteredExpenses).map(cat => cat.total);
            
            createOrUpdateChart("pie", chartData);
        } else {
            createTimelineChart(filteredExpenses);
        }
        
        savedChartData = chartData;
    }

    function createTimelineChart(filteredExpenses) {
        const timelineData = prepareTimelineData(filteredExpenses);
        
        const datasets = Object.keys(filteredExpenses).map((category, index) => {
            return {
                label: category,
                data: timelineData.dates.map(date => {
                    const dateData = timelineData.data[date] || {};
                    return dateData[category] || 0;
                }),
                backgroundColor: chartColors[index % chartColors.length],
                borderColor: chartColors[index % chartColors.length],
                borderWidth: 1
            };
        });
        
        const timeChartData = {
            labels: timelineData.dates.map(date => new Date(date).toLocaleDateString()),
            datasets: datasets
        };
        
        createOrUpdateChart("line", timeChartData);
    }

    function prepareTimelineData(filteredExpenses) {
        const dateMap = {};
        const allDates = new Set();
        
        for (const category in filteredExpenses) {
            filteredExpenses[category].items.forEach(item => {
                const date = item.timestamp.split('T')[0];
                allDates.add(date);
                
                if (!dateMap[date]) {
                    dateMap[date] = {};
                }
                
                if (!dateMap[date][category]) {
                    dateMap[date][category] = 0;
                }
                
                dateMap[date][category] += item.amount;
            });
        }
        
        const sortedDates = Array.from(allDates).sort();
        
        return {
            dates: sortedDates,
            data: dateMap
        };
    }

    function createOrUpdateChart(type, data) {
        if (expenseChart) {
            expenseChart.destroy();
        }
        
        const options = type === 'pie' ? 
            { responsive: true } : 
            { 
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Amount ($)'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Date'
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: $${context.parsed.y.toFixed(2)}`;
                            }
                        }
                    }
                }
            };
        
        const canvas = createChartCanvas();
        chartContainer.innerHTML = "";
        chartContainer.appendChild(canvas);
        
        expenseChart = new Chart(canvas, {
            type: type,
            data: data,
            options: options
        });
    }

    function showCategoryBreakdown(category) {
        if (currentChart) {
            currentChart.destroy();
        }

        const filteredExpenses = filterExpensesByTime();
        if (!filteredExpenses[category]) return;

        const expenseCanvas = createChartCanvas();
        chartContainer.innerHTML = "";
        chartContainer.appendChild(expenseCanvas);

        currentChart = new Chart(expenseCanvas, {
            type: "pie",
            data: {
                labels: filteredExpenses[category].items.map(item => item.name),
                datasets: [{
                    data: filteredExpenses[category].items.map(item => item.amount),
                    backgroundColor: chartColors
                }]
            },
            options: { 
                responsive: true,
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const value = context.parsed;
                                const label = context.label;
                                return `${label}: $${value.toFixed(2)}`;
                            }
                        }
                    }
                }
            }
        });
    }

    function restoreMainChart() {
        if (currentChart) {
            currentChart.destroy();
            currentChart = null;
        }
        
        updateChart();
    }

    function createChartCanvas() {
        const canvas = document.createElement("canvas");
        canvas.classList.add("expense-chart");
        return canvas;
    }

    function filterExpenses(searchText) {
        if (!searchText) {
            updateCategoryList();
            return;
        }
        
        searchText = searchText.toLowerCase();

        const categoryItems = document.querySelectorAll(".category-item");
        categoryItems.forEach(item => {
            const category = item.dataset.category;
            const hasMatch = category.toLowerCase().includes(searchText) ||
                expenses[category].items.some(expense => 
                    expense.name.toLowerCase().includes(searchText) ||
                    (expense.notes && expense.notes.toLowerCase().includes(searchText))
                );
            
            item.style.display = hasMatch ? "" : "none";
        });
    }

    function updateStatistics() {
        if (!statsSummary) return;

        const filteredExpenses = filterExpensesByTime();

        let totalExpenses = 0;
        let expenseCount = 0;
        let maxExpense = { amount: 0, name: "", category: "" };
        let categoriesCount = Object.keys(filteredExpenses).length;
        
        for (const category in filteredExpenses) {
            const items = filteredExpenses[category].items;
            expenseCount += items.length;
            
            items.forEach(item => {
                totalExpenses += item.amount;
                
                if (item.amount > maxExpense.amount) {
                    maxExpense = {
                        amount: item.amount,
                        name: item.name,
                        category: category,
                        date: item.formattedDate
                    };
                }
            });
        }
        
        const avgExpense = expenseCount > 0 ? totalExpenses / expenseCount : 0;

        let dateRangeText = "All time";
        if (timeRangeFilter && timeRangeFilter.value !== "all") {
            dateRangeText = {
                today: "Today",
                week: "Last 7 days",
                month: "Last 30 days",
                year: "Last year"
            }[timeRangeFilter.value];
        }

        statsSummary.innerHTML = `
            <h3>Statistics (${dateRangeText})</h3>
            <div class="stats-grid">
                <div class="stat-item">
                    <div class="stat-value">$${totalExpenses.toFixed(2)}</div>
                    <div class="stat-label">Total Spent</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${expenseCount}</div>
                    <div class="stat-label">Expenses</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${categoriesCount}</div>
                    <div class="stat-label">Categories</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">$${avgExpense.toFixed(2)}</div>
                    <div class="stat-label">Average</div>
                </div>
            </div>
            ${maxExpense.name ? `
            <div class="max-expense">
                <h4>Largest Expense:</h4>
                <div class="max-expense-details">
                    $${maxExpense.amount.toFixed(2)} for ${maxExpense.name} 
                    (${maxExpense.category}) on ${maxExpense.date}
                </div>
            </div>` : ''}
        `;
    }

    function showNotification(message, type) {
        const notification = document.createElement("div");
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add("show");
        }, 10);

        setTimeout(() => {
            notification.classList.remove("show");
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }

    function saveExpenses() {
        localStorage.setItem("expenses", JSON.stringify(expenses));
        localStorage.setItem("totalExpense", total.toString());
    }

    function loadExpenses() {
        if (Object.keys(expenses).length === 0) return;

        for (const category in expenses) {
            if (!Array.from(categorySelect.options).some(opt => opt.value === category)) {
                const option = document.createElement("option");
                option.value = category;
                option.textContent = category;
                categorySelect.insertBefore(option, categorySelect.lastElementChild);
            }
            
            addCategoryToList(category);
            updateCategoryTotal(category);
        }
    }
});