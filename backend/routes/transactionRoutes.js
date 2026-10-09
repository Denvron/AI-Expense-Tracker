import express from 'express';
import {
    getTransactions,
    createTransaction,
    getTransactionById,
    updateTransaction,
    deleteTransaction,
    analyzeTransactions,
} from '../controllers/transactionController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.get('/analyze', (req, res) => {
    res.set('Allow', 'POST').status(405).json({
        message: 'Use POST /api/transactions/analyze to analyze transactions',
    });
});
router.get('/', getTransactions);
router.post('/', createTransaction);
router.post('/analyze', analyzeTransactions);
router.param('id', (req, res, next, id) => {
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
        return res.status(400).json({ message: 'Transaction id must be a positive integer' });
    }
    next();
});
router.get('/:id', getTransactionById);
router.put('/:id', updateTransaction);
router.delete('/:id', deleteTransaction);

export default router;