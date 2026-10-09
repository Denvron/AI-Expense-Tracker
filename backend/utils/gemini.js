import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMIN_API_KEY });
const model = 'gemini-3.8-flash';

if(!process.env.GEMINI_API_KEY) {
    console.error('⚠️ WARNING: GEMIN_API_KEY is not set. AI features will not work.');
}

const stripMarkdown = (text) => {
    let cleaned = text.trim();
    if(cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/```json\n?/g, '').replace(/```\n?$/g, '');
    }else if (cleaned.startsWith('```')){
        cleaned = cleaned.replace(/```\n?/g, '');
    }
    return cleaned.trim();
};

const generateContentWithRetry = async (contents) => {
    const retryableStatuses = new Set([429, 500, 502, 503, 504]);
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            return await ai.models.generateContent({ model, contents });
        } catch (error) {
            if (!retryableStatuses.has(Number(error?.status)) || attempt === maxAttempts) {
                throw error;
            }

            await new Promise((resolve) => setTimeout(resolve, 1000 * (2 ** (attempt - 1))));
        }
    }
};


export const generateMonthlyInsight = async ({
    totalIncome,
    totalExpenses,
    savingsRate,
    expenseBreakdown,
    previousMonths,
    currency = 'USD',
}) => {
    const breakdownText = expenseBreakdown.length > 0
        ? expenseBreakdown.map(c => `- ${c.category}: ${currency} ${c.amount.toFixed(2)}`).join('\n')
        : '- No expenses recorded yet';

    const trendText = previousMonths.length > 0
        ? previousMonths.map(m => `- ${m.month}: Income ${currency} ${m.income.toFixed(2)}, Expenses ${currency})`).join('\n')
        : '- No previous month data available';

    const prompt = `Analyze this user's monthly financial data and generate actionable insiglts.
    
Currency: ${currency}
Total Income (this month): ${currency} ${totalIncome.toFixed(2)}
Total Expenses (this month): ${currency} ${totalExpenses.toFixed(2)}
Savings Rate: ${savingsRate.toFixed(1)}%

Expense breakdown by category (this month): ${breakdownText}

Previous month data: ${trendText}

return ONLY valid JSON (no markdown, no commentry) in this exact structure:
{
    "summary": "2-3 sentense summary of the user's financial health this month",
    "highlights": ["Positive Observation 1", "Positive Observation 2"],
    "concerns": ["Concern 1", "Concern 2"],
    "recommendations": [
        {"title": "Short title", "detail": "Actionable suggestion (1-2 sentences)"},
    ],
    "topSpendingCategory": "Category name or null",
    "estimatedMonthlySavings": number,
    "healthScore": number
}
Constraints:
- "healthScore" must be an integer between 0 and 100.
- Provide 3 recommendations
- Reference actual numbers from the data. Tone: friendly but honest.`;

    try {
        const response = await generateContentWithRetry([prompt]);
        const cleaned = stripMarkdown(response.text);
        return JSON.parse(cleaned);
    } catch (error) {
        console.error('Gemini API Error (Monthly insight):', error);
        throw new Error('Failed to generate monthly insight. Please try again')
    }
};


export const generateBudgetAlert = async ({
    categoryName,
    budgetAmount,
    spentAmount,
    daysIntoPeriod,
    totalPreiodDays,
    currency = 'USD',
}) => {
    const percentUsed = ((spentAmount / budgetAmount) * 100).toFixed(1);
    const daysLeft = totalPreiodDays - daysIntoPeriod;

    const prompt = `A user is tracking a budget. Generate a heplful alert.
    
Category: ${categoryName}
Budget: ${currency} ${budgetAmount.toFixed(2)}
Spent so far: ${currency} ${spentAmount.toFixed(2)} (${percentUsed}% used)
Days into period: ${daysIntoPeriod} of ${totalPreiodDays} (${daysLeft} days remaining)

Return only valid JSON (no markdown):
{
    "severity": "info|warning|critical"
    "title": "Short alert title",
    "message": "1-2 sentence empathetic message referencing actual numbers",
    "suggestions": ["Specific Action 1", "Specific Action 2", "Specific Action 3"]
}

Severity guide:
- info: under 70% spent
- warning: 70-100% spent
- critical: over 100% spent`;

    try {
        const response = await generateContentWithRetry(prompt);
    } catch (error) {
        console.error('Gemini API Error (Budget alert):', error);
        throw new Error('Failed to generate budget alert. Please try again')
    }
};

export const generateSavingsTips = async ({ topCategories, monthIncome, currency = "USD" }) => {
    const CategoryText = topCategories.length > 0
        ?   topCategories.map(c => `- ${c.category}: ${currency} ${c.amount.toFixed(2)} ${c.transactionCount} transactions`).join('\n')
        : '- No spending data available';

    const prompt = `Generate personalized savings tips for the user.
    
Monthly income (last 30 days): ${currency} ${monthIncome.toFixed(2)}
Top spending categories (last 30 days): 
${CategoryText}

Return ONLY valid JSON (no markdown):
{
    "overallTip": "Top-level 1 sentence advise"'
    "tips": [
        {
            "category": "Category this targets",
            "title": "Short tip title",
            "detail": "2-3 sentence actionable suggestion",
            "estimatedSavings": number
        }
    ]
}

Provide exactly 4 tips. Each tip should reference an actual category from the data and include a realistic mpnthly savings.`;

    try {
        const response = await generateContentWithRetry(prompt);
        const cleaned = stripMarkdown(response.text);
        return JSON.parse(cleaned);
    } catch (error) {
        console.error('Gemini API error(Savingstips):', error);
        throw new Error('Failed to generate savingstips. Please try again')
    }
};

export const analyzeTransactionList = async ({ transactions, currency = 'USD'}) => {
    const formatDate = (d) => {
        if(!d) return '';
        if (d instanceof Date) {
            const y = d.getFullYear();
            const m = String(d.getMonth() +1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        }
        return String(d).split('T')[0];
    };

    const lines = transactions
        .slice(0, 50)
        .map((t) => {
            const date = formatDate(t.transaction_date);
            const amt = parseFloat(t.amount).toFixed(2);
            const cat = t.category_name || 'Uncategorized';
            const desc = t.description ? ` | ${t.description}` : '';
            return `-${date}: ${t.type} ${currency} ${amt} | ${cat}${desc}`;
        })
        .join('\n');

    const prompt = `Analyze these ${transactions.length} transactions and provide a concise, helpful spending insight.
    
Transactions:
${lines}

Return ONLY valid JSON (no markdown):
{
    "insight": "2-4 sentence analysis with specific numbers from the data. Tone: friendly, helpful.",
    "highlight": "Single short phrase capturing the key takeaway (e.g., 'Heavy Dining', 'Stable Income', 'Moderate Spending')."
}`;

        try {
            const response = await generateContentWithRetry(prompt);
            const cleaned = stripMarkdown(response.text);
            return JSON.parse(cleaned);
        } catch (error) {
            console.error('Gemini API error (analyzeTransactionList):', error);
            const status = Number(error?.status);
            if ([429, 500, 502, 503, 504].includes(status)) {
                const serviceError = new Error('AI service is temporarily unavailable. Please try again shortly.');
                serviceError.status = status === 429 ? 429 : 503;
                throw serviceError;
            }
            throw new Error('Failed to analyze transactions. Please try again')
        }
};

export const analyzeBudgetList = async ({ budgets, currency = 'USD'}) => {
    const lines = budgets.map((b) => {
        const spent = parseFloat(b.spent);
        const total = parseFloat(b.amount);
        const pct = total > 0 ? ((spent / total) * 100).toFixed(1) : 0;
        return `Budget ID ${b.id}| Category: ${b.category_name} | Limit: ${currency} ${total.toFixed(2)} | Spent: ${currency} ${spent.toFixed(2)} | ${pct}% spent`;
    }).join('\n');
    
    const prompt = `You're a presonal Finance Assistant. Analyze each budget below and provide a one-sentence summary of the budget.
    
Today: ${new Date().toISOString().split('T')[0]}

Budgets:
${lines}

For each budget, return:
- status: 'good'(well-paced, under target), 'caution' (appraching limit or over 70%), or concerning(over 100%)
- message: A specific, friendly 1-sentence assessment with actionable feedback or encouraement

Return ONLY valie JSON (no markdown):
{
    "analysis": [
        {"budgetId": number, "status": "good"|"cautious"|"concerning", "message": "string"}
    ]
}`;

    try {
        const response = await generateContentWithRetry(prompt);
        const cleaned = stripMarkdown(response.text);
        return JSON.parse(cleaned);
    } catch (error) {
        console.error('Gemini API error (analyze budgets):', error);
        throw new Error('Failed to analyze budgets. Please try again')
    }
};

export default {
    generateMonthlyInsight,
    generateSavingsTips,
    generateBudgetAlert,
    analyzeTransactionList,
    analyzeBudgetList,
};