/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from "react";
import { useState, useMemo, useEffect, createContext, useContext, Component } from "react";
import { 
  Settings, 
  Plus, 
  Edit2, 
  Trash2, 
  ChevronDown, 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Receipt, 
  CreditCard,
  X,
  Save,
  LogOut,
  Lock,
  Mail,
  AlertCircle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// --- Types ---

interface User {
  uid: string;
  email: string;
}

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  gst: number;
  total: number;
  type?: 'income' | 'expense';
  userId?: string;
  createdAt?: string;
}

interface Liability {
  id: string;
  date: string;
  account: string;
  description: string;
  amount: number;
  type?: 'credit' | 'debit';
  userId?: string;
  createdAt?: string;
}

interface Account {
  id: string;
  name: string;
  userId?: string;
  createdAt?: string;
}

interface DueSummary {
  account: string;
  amount: number;
}

// --- Auth Context ---

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  authError: string | null;
  setAuthError: (error: string | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('fintech_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const login = async () => {
    setAuthError(null);
    const mockUser = { uid: 'local-user', email: 'demo@example.com' };
    setUser(mockUser);
    localStorage.setItem('fintech_user', JSON.stringify(mockUser));
  };

  const logout = async () => {
    setUser(null);
    localStorage.removeItem('fintech_user');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, authError, setAuthError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// --- Precision Math Helper ---
const formatCurrency = (num: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(num);
};

const preciseAdd = (a: number, b: number) => {
  return Math.round((Number(a) + Number(b)) * 100) / 100;
};

const preciseSub = (a: number, b: number) => {
  return Math.round((Number(a) - Number(b)) * 100) / 100;
};

const preciseMul = (a: number, b: number) => {
  return Math.round((Number(a) * Number(b)) * 100) / 100;
};

// --- Initial Data ---

const INITIAL_INCOME: Transaction[] = [
  { id: "1", date: "2nd April", description: "Entity 401", amount: 1000, gst: 180, total: 1180 },
  { id: "2", date: "2nd April", description: "Scoop 909", amount: 1000, gst: 180, total: 1180 },
  { id: "3", date: "2nd April", description: "Entity 401", amount: 1000, gst: 180, total: 1180 },
  { id: "4", date: "2nd April", description: "Entity 409", amount: 1000, gst: 180, total: 1180 },
  { id: "5", date: "2nd April", description: "Entity 401", amount: 1000, gst: 180, total: 1180 },
  { id: "6", date: "2nd April", description: "Scoop Labs", amount: 1000, gst: 180, total: 1180 },
];

const INITIAL_EXPENSE: Transaction[] = [
  { id: "1", date: "2nd April", description: "Entity 401", amount: 1000, gst: 180, total: 1180 },
  { id: "2", date: "2nd April", description: "Entity 909", amount: 1000, gst: 180, total: 1180 },
  { id: "3", date: "2nd April", description: "Entity 401", amount: 1000, gst: 180, total: 1180 },
  { id: "4", date: "2nd April", description: "Entity 909", amount: 1000, gst: 180, total: 1180 },
  { id: "5", date: "2nd April", description: "Stationary", amount: 1000, gst: 180, total: 1180 },
];

const INITIAL_LIABILITY_CREDIT: Liability[] = [
  { id: "1", date: "2nd April", account: "HDFC", description: "Rent", amount: 1000 },
  { id: "2", date: "2nd April", account: "Indus", description: "Rent", amount: 1000 },
  { id: "3", date: "2nd April", account: "Entity 909", description: "Rent", amount: 1000 },
  { id: "4", date: "2nd April", account: "Entity 401", description: "Rent", amount: 1000 },
];

const INITIAL_LIABILITY_DEBIT: Liability[] = [
  { id: "1", date: "2nd April", account: "Entity N1", description: "partpayment", amount: 2500 },
];

const INITIAL_ACCOUNTS: Account[] = [
  { id: "1", name: "Entity 401" },
  { id: "2", name: "Entity 909" },
  { id: "3", name: "Entity N1" },
  { id: "4", name: "HDFC" },
  { id: "5", name: "Indus" },
];

const INITIAL_DUE: DueSummary[] = [
  { account: "HDFC", amount: 1000 },
  { account: "Indus", amount: 2000 },
];

// --- Main Component ---

function Dashboard() {
  const { user, logout } = useAuth();
  
  // State
  const [income, setIncome] = useState<Transaction[]>([]);
  const [expense, setExpense] = useState<Transaction[]>([]);
  const [liabilityCredit, setLiabilityCredit] = useState<Liability[]>([]);
  const [liabilityDebit, setLiabilityDebit] = useState<Liability[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  
  const [currentMonth, setCurrentMonth] = useState("April");
  const [currentYear, setCurrentYear] = useState("2026");
  const [viewDuration, setViewDuration] = useState(1); // 1, 3, 4, 6 months
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // --- Local Storage Sync ---
  useEffect(() => {
    if (!user) return;

    const savedTransactions = localStorage.getItem(`transactions_${user.uid}`);
    const savedLiabilities = localStorage.getItem(`liabilities_${user.uid}`);
    const savedAccounts = localStorage.getItem(`accounts_${user.uid}`);

    if (savedTransactions) {
      const all = JSON.parse(savedTransactions) as (Transaction & { type: string })[];
      setIncome(all.filter(t => t.type === 'income'));
      setExpense(all.filter(t => t.type === 'expense'));
    } else {
      // Load initial data if empty
      const initial = [
        ...INITIAL_INCOME.map(t => ({ ...t, type: 'income', userId: user.uid })),
        ...INITIAL_EXPENSE.map(t => ({ ...t, type: 'expense', userId: user.uid }))
      ];
      localStorage.setItem(`transactions_${user.uid}`, JSON.stringify(initial));
      setIncome(INITIAL_INCOME);
      setExpense(INITIAL_EXPENSE);
    }

    if (savedLiabilities) {
      const all = JSON.parse(savedLiabilities) as (Liability & { type: string })[];
      setLiabilityCredit(all.filter(l => l.type === 'credit'));
      setLiabilityDebit(all.filter(l => l.type === 'debit'));
    } else {
      const initial = [
        ...INITIAL_LIABILITY_CREDIT.map(l => ({ ...l, type: 'credit', userId: user.uid })),
        ...INITIAL_LIABILITY_DEBIT.map(l => ({ ...l, type: 'debit', userId: user.uid }))
      ];
      localStorage.setItem(`liabilities_${user.uid}`, JSON.stringify(initial));
      setLiabilityCredit(INITIAL_LIABILITY_CREDIT);
      setLiabilityDebit(INITIAL_LIABILITY_DEBIT);
    }

    if (savedAccounts) {
      setAccounts(JSON.parse(savedAccounts));
    } else {
      localStorage.setItem(`accounts_${user.uid}`, JSON.stringify(INITIAL_ACCOUNTS));
      setAccounts(INITIAL_ACCOUNTS);
    }
  }, [user]);

  // Helper to save data
  const saveTransactions = (newTransactions: any[]) => {
    if (!user) return;
    localStorage.setItem(`transactions_${user.uid}`, JSON.stringify(newTransactions));
  };

  const saveLiabilities = (newLiabilities: any[]) => {
    if (!user) return;
    localStorage.setItem(`liabilities_${user.uid}`, JSON.stringify(newLiabilities));
  };

  const saveAccounts = (newAccounts: any[]) => {
    if (!user) return;
    localStorage.setItem(`accounts_${user.uid}`, JSON.stringify(newAccounts));
  };

  // --- Aggregated Due Summary ---
  const aggregatedDueSummary = useMemo(() => {
    const dues: Record<string, number> = {};
    
    liabilityCredit.forEach(item => {
      dues[item.account] = preciseAdd(dues[item.account] || 0, item.amount);
    });
    
    liabilityDebit.forEach(item => {
      dues[item.account] = preciseSub(dues[item.account] || 0, item.amount);
    });

    return Object.entries(dues)
      .filter(([_, amount]) => amount !== 0)
      .map(([account, amount]) => ({ account, amount }));
  }, [liabilityCredit, liabilityDebit]);

  // --- Advanced Calculation Engine ---
  const calculations = useMemo(() => {
    // Base monthly totals
    const baseIncome = income.reduce((acc, curr) => preciseAdd(acc, curr.total), 0);
    const baseExpense = expense.reduce((acc, curr) => preciseAdd(acc, curr.total), 0);
    const baseGstIn = income.reduce((acc, curr) => preciseAdd(acc, curr.gst), 0);
    const baseGstOut = expense.reduce((acc, curr) => preciseAdd(acc, curr.gst), 0);

    // Multi-month aggregation
    const totalIncome = preciseMul(baseIncome, viewDuration);
    const totalExpense = preciseMul(baseExpense, viewDuration);
    const gstInput = preciseMul(baseGstIn, viewDuration);
    const gstOutput = preciseMul(baseGstOut, viewDuration);
    
    const gstPayable = preciseSub(gstInput, gstOutput);
    const profitLoss = preciseSub(totalIncome, totalExpense);
    const profitLossPercent = totalIncome > 0 ? (profitLoss / totalIncome) * 100 : 0;

    // Projections
    const projectedAnnual = preciseMul(baseIncome, 12);
    const monthlyAverage = baseIncome;

    return {
      totalIncome,
      totalExpense,
      gstInput,
      gstOutput,
      gstPayable,
      profitLoss,
      profitLossPercent,
      projectedAnnual,
      monthlyAverage
    };
  }, [income, expense, viewDuration]);

  // Handlers
  const addIncome = async () => {
    if (!user) return;
    const newT: Transaction = {
      id: Math.random().toString(36).substr(2, 9),
      date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long' }),
      description: "New Income",
      amount: 0,
      gst: 0,
      total: 0,
      type: 'income',
      userId: user.uid,
      createdAt: new Date().toISOString()
    };
    const updated = [...income, newT];
    setIncome(updated);
    saveTransactions([...updated, ...expense.map(e => ({ ...e, type: 'expense' }))]);
  };

  const addExpense = async () => {
    if (!user) return;
    const newT: Transaction = {
      id: Math.random().toString(36).substr(2, 9),
      date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long' }),
      description: "New Expense",
      amount: 0,
      gst: 0,
      total: 0,
      type: 'expense',
      userId: user.uid,
      createdAt: new Date().toISOString()
    };
    const updated = [...expense, newT];
    setExpense(updated);
    saveTransactions([...income.map(i => ({ ...i, type: 'income' })), ...updated]);
  };

  const addLiabilityCredit = async () => {
    if (!user) return;
    const newL: Liability = {
      id: Math.random().toString(36).substr(2, 9),
      date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long' }),
      account: "",
      description: "New Credit",
      amount: 0,
      type: 'credit',
      userId: user.uid,
      createdAt: new Date().toISOString()
    };
    const updated = [...liabilityCredit, newL];
    setLiabilityCredit(updated);
    saveLiabilities([...updated, ...liabilityDebit.map(d => ({ ...d, type: 'debit' }))]);
  };

  const addLiabilityDebit = async () => {
    if (!user) return;
    const newL: Liability = {
      id: Math.random().toString(36).substr(2, 9),
      date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long' }),
      account: "",
      description: "New Debit",
      amount: 0,
      type: 'debit',
      userId: user.uid,
      createdAt: new Date().toISOString()
    };
    const updated = [...liabilityDebit, newL];
    setLiabilityDebit(updated);
    saveLiabilities([...liabilityCredit.map(c => ({ ...c, type: 'credit' })), ...updated]);
  };

  const addAccount = async () => {
    if (!user) return;
    const name = prompt("Enter account name:");
    if (name) {
      const newAcc: Account = {
        id: Math.random().toString(36).substr(2, 9),
        name,
        userId: user.uid,
        createdAt: new Date().toISOString()
      };
      const updated = [...accounts, newAcc];
      setAccounts(updated);
      saveAccounts(updated);
    }
  };

  const updateTransaction = async (type: 'income' | 'expense', id: string, field: keyof Transaction, value: any) => {
    const list = type === 'income' ? income : expense;
    const updatedList = list.map(t => {
      if (t.id === id) {
        const val = (field === 'amount' || field === 'gst') ? Number(value) || 0 : value;
        const newT = { ...t, [field]: val };
        if (field === 'amount' || field === 'gst') {
          newT.total = preciseAdd(Number(newT.amount), Number(newT.gst));
        }
        return newT;
      }
      return t;
    });

    if (type === 'income') {
      setIncome(updatedList);
      saveTransactions([...updatedList, ...expense.map(e => ({ ...e, type: 'expense' }))]);
    } else {
      setExpense(updatedList);
      saveTransactions([...income.map(i => ({ ...i, type: 'income' })), ...updatedList]);
    }
  };

  const updateLiability = async (type: 'credit' | 'debit', id: string, field: keyof Liability, value: any) => {
    const list = type === 'credit' ? liabilityCredit : liabilityDebit;
    const updatedList = list.map(l => {
      if (l.id === id) {
        const val = field === 'amount' ? Number(value) || 0 : value;
        return { ...l, [field]: val };
      }
      return l;
    });

    if (type === 'credit') {
      setLiabilityCredit(updatedList);
      saveLiabilities([...updatedList, ...liabilityDebit.map(d => ({ ...d, type: 'debit' }))]);
    } else {
      setLiabilityDebit(updatedList);
      saveLiabilities([...liabilityCredit.map(c => ({ ...c, type: 'credit' })), ...updatedList]);
    }
  };

  const deleteTransaction = async (id: string) => {
    const newIncome = income.filter(t => t.id !== id);
    const newExpense = expense.filter(t => t.id !== id);
    setIncome(newIncome);
    setExpense(newExpense);
    saveTransactions([
      ...newIncome.map(i => ({ ...i, type: 'income' })),
      ...newExpense.map(e => ({ ...e, type: 'expense' }))
    ]);
  };

  const deleteLiability = async (id: string) => {
    const newCredit = liabilityCredit.filter(l => l.id !== id);
    const newDebit = liabilityDebit.filter(l => l.id !== id);
    setLiabilityCredit(newCredit);
    setLiabilityDebit(newDebit);
    saveLiabilities([
      ...newCredit.map(c => ({ ...c, type: 'credit' })),
      ...newDebit.map(d => ({ ...d, type: 'debit' }))
    ]);
  };

  const deleteAccount = async (id: string) => {
    const updated = accounts.filter(a => a.id !== id);
    setAccounts(updated);
    saveAccounts(updated);
  };

  return (
    <div className="min-h-screen bg-[#f0f2f5] text-gray-800 font-sans p-4 lg:p-6">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 bg-white p-4 rounded-xl shadow-sm border border-gray-100 gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-[#1a365d]">Dashboard</h1>
          <div className="h-6 w-[1px] bg-gray-300 mx-2 hidden md:block"></div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 font-medium">Entity ABC</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
          {/* Duration Selector */}
          <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100">
            <span className="text-[10px] font-bold text-blue-600 uppercase">View Period:</span>
            <select 
              value={viewDuration} 
              onChange={(e) => setViewDuration(Number(e.target.value))}
              className="bg-transparent font-bold text-[0.9em] text-blue-800 outline-none cursor-pointer"
            >
              <option value={1}>1 Month</option>
              <option value={3}>3 Months</option>
              <option value={4}>4 Months</option>
              <option value={6}>6 Months</option>
            </select>
          </div>

          <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
            <select 
              value={currentMonth} 
              onChange={(e) => setCurrentMonth(e.target.value)}
              className="bg-transparent font-semibold text-[0.9em] outline-none cursor-pointer"
            >
              {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <select 
              value={currentYear} 
              onChange={(e) => setCurrentYear(e.target.value)}
              className="bg-transparent font-semibold text-[0.9em] outline-none cursor-pointer"
            >
              {["2024", "2025", "2026", "2027"].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-600"
          >
            <Settings size={22} />
          </button>
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Summary and Tables */}
        <div className="lg:col-span-9 space-y-6">
          
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard 
              title={`Total Income (${viewDuration}m)`} 
              value={formatCurrency(calculations.totalIncome)} 
              icon={<Wallet className="text-blue-600" />}
              bgColor="bg-blue-50"
              details={viewDuration > 1 ? `Avg: ${formatCurrency(calculations.monthlyAverage)} / mo` : ""}
            />
            <SummaryCard 
              title={`Total Expense (${viewDuration}m)`} 
              value={formatCurrency(calculations.totalExpense)} 
              icon={<Receipt className="text-orange-600" />}
              bgColor="bg-orange-50"
            />
            <SummaryCard 
              title="Profit/Loss Analysis" 
              value={`${formatCurrency(Math.abs(calculations.profitLoss))} / ${calculations.profitLossPercent.toFixed(2)}%`} 
              isProfit={calculations.profitLoss >= 0}
              icon={<TrendingUp className={calculations.profitLoss >= 0 ? "text-green-600" : "text-red-600"} />}
              bgColor={calculations.profitLoss >= 0 ? "bg-green-50" : "bg-red-50"}
              details={calculations.profitLoss >= 0 ? "Healthy Margin" : "Critical Deficit"}
            />
            <SummaryCard 
              title="GST Period Summary" 
              value={formatCurrency(calculations.gstPayable)} 
              details={`In: ${formatCurrency(calculations.gstInput)} | Out: ${formatCurrency(calculations.gstOutput)}`}
              icon={<CreditCard className="text-indigo-600" />}
              bgColor="bg-indigo-50"
            />
          </div>

          {/* Tables Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Income Table */}
            <TableSection 
              title="Income" 
              data={income} 
              onAdd={addIncome}
              onUpdate={(id: string, f: any, v: any) => updateTransaction('income', id, f, v)}
              onDelete={deleteTransaction}
              totals={{ 
                amount: income.reduce((a,c) => preciseAdd(a, c.amount), 0), 
                gst: income.reduce((a,c) => preciseAdd(a, c.gst), 0), 
                total: income.reduce((a,c) => preciseAdd(a, c.total), 0) 
              }}
            />

            {/* Expense Table */}
            <TableSection 
              title="Expense" 
              data={expense} 
              onAdd={addExpense}
              onUpdate={(id: string, f: any, v: any) => updateTransaction('expense', id, f, v)}
              onDelete={deleteTransaction}
              totals={{ 
                amount: expense.reduce((a,c) => preciseAdd(a, c.amount), 0), 
                gst: expense.reduce((a,c) => preciseAdd(a, c.gst), 0), 
                total: expense.reduce((a,c) => preciseAdd(a, c.total), 0) 
              }}
            />

            {/* Liability Credit Table */}
            <LiabilityTable 
              title="Liability Credit" 
              data={liabilityCredit} 
              onAdd={addLiabilityCredit}
              onUpdate={(id: string, f: any, v: any) => updateLiability('credit', id, f, v)}
              onDelete={deleteLiability}
            />

            {/* Liability Debit Table */}
            <LiabilityTable 
              title="Liability Debit" 
              data={liabilityDebit} 
              onAdd={addLiabilityDebit}
              onUpdate={(id: string, f: any, v: any) => updateLiability('debit', id, f, v)}
              onDelete={deleteLiability}
            />
          </div>
        </div>

        {/* Right Column: Side Panels */}
        <div className="lg:col-span-3 space-y-6">
          {/* Accounts Panel */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-[#1a365d] text-white p-3 flex justify-between items-center">
              <h3 className="font-semibold text-[10px]">Accounts</h3>
              <button onClick={addAccount} className="p-1 hover:bg-white/20 rounded transition-colors">
                <Plus size={12} />
              </button>
            </div>
            <div className="p-3 space-y-2">
              {accounts.map(acc => (
                <div key={acc.id} className="bg-gray-50 p-1.5 rounded border border-gray-100 text-[10px] font-medium text-gray-600 flex justify-between items-center group">
                  {acc.name}
                  <button 
                    onClick={() => deleteAccount(acc.id)}
                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Due Summary Panel */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-[#1a365d] text-white p-3">
              <h3 className="font-semibold text-[10px]">Due to Summary</h3>
            </div>
            <div className="p-3 space-y-2">
              {aggregatedDueSummary.map((due, idx) => (
                <div key={idx} className="bg-gray-50 p-1.5 rounded border border-gray-100 text-[10px] font-medium text-gray-600 flex justify-between">
                  <span>{due.account}:</span>
                  <span className="font-bold text-[#1a365d]">{formatCurrency(due.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h2 className="text-xl font-bold text-gray-800">Settings</h2>
                <button onClick={() => setIsSettingsOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={24} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                      {user?.email?.[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-800">{user?.email}</p>
                      <p className="text-[10px] text-gray-500">Local Session</p>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={() => {
                    logout();
                    setIsSettingsOpen(false);
                  }}
                  className="w-full bg-red-50 text-red-600 py-3 rounded-xl font-bold hover:bg-red-100 transition-all flex items-center justify-center gap-2 border border-red-100"
                >
                  <LogOut size={18} />
                  Log Out
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Login Component ---

function Login() {
  const { login, authError, setAuthError } = useAuth();

  return (
    <div className="min-h-screen bg-[#f0f2f5] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-gray-100"
      >
        <div className="bg-[#1a365d] p-8 text-center">
          <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-md border border-white/20">
            <Lock className="text-white" size={32} />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Secure Dashboard</h1>
          <p className="text-blue-200 text-sm">Access your financial records safely</p>
        </div>
        
        <div className="p-8 space-y-6">
          {authError && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="p-4 bg-red-50 rounded-2xl border border-red-100 flex items-start gap-3 relative"
            >
              <AlertCircle className="text-red-600 shrink-0" size={20} />
              <div className="flex-1">
                <p className="text-xs text-red-800 leading-relaxed font-medium">
                  {authError}
                </p>
              </div>
              <button 
                onClick={() => setAuthError(null)}
                className="text-red-400 hover:text-red-600 transition-colors"
              >
                <X size={16} />
              </button>
            </motion.div>
          )}

          <div className="space-y-4">
            <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex items-start gap-3">
              <AlertCircle className="text-blue-600 shrink-0" size={20} />
              <p className="text-xs text-blue-800 leading-relaxed">
                This dashboard uses local storage to keep your data private on this device.
              </p>
            </div>
          </div>

          <button 
            onClick={login}
            className="w-full bg-[#1a365d] text-white py-4 rounded-2xl font-bold hover:bg-[#2a4a7d] transition-all flex items-center justify-center gap-3 shadow-lg group"
          >
            <Lock size={20} className="group-hover:scale-110 transition-transform" />
            Continue with Local Session
          </button>

          <p className="text-center text-[10px] text-gray-400">
            By continuing, you agree to the secure data handling policies.
          </p>
        </div>
      </motion.div>
    </div>
  );
}

// --- Error Boundary ---

// --- App Wrapper ---

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-bold text-gray-500">Securing Connection...</p>
        </div>
      </div>
    );
  }

  return user ? <Dashboard /> : <Login />;
}

// --- Sub-components ---

function SummaryCard({ title, value, icon, bgColor, percent, isProfit, details }: any) {
  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-start gap-4">
      <div className={`${bgColor} p-3 rounded-xl`}>
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
        <div className="flex items-center gap-2">
          <h4 className="text-xl font-bold text-gray-800">{value}</h4>
          {percent && (
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${isProfit ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {isProfit ? '+' : '-'}{percent}
            </span>
          )}
        </div>
        {details && (
          <p className="text-[10px] text-gray-400 mt-1 font-medium">{details}</p>
        )}
      </div>
    </div>
  );
}

function TableSection({ title, data, onAdd, onUpdate, onDelete, totals }: any) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
      <div className="bg-[#1a365d] text-white p-3 flex justify-between items-center">
        <h3 className="font-semibold text-sm">{title}</h3>
        <button onClick={onAdd} className="p-1 hover:bg-white/20 rounded transition-colors">
          <Plus size={16} />
        </button>
      </div>
      <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-200">
        <div className="max-h-[250px] overflow-y-auto relative">
          <table className="w-full text-left border-collapse min-w-[600px] table-fixed">
            <thead className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_rgba(0,0,0,0.05)]">
              <tr>
                <th className="p-2 w-10"></th>
                <th className="p-2 w-[20%] text-[10px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Date</th>
                <th className="p-2 w-[20%] text-[10px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Description</th>
                <th className="p-2 w-[20%] text-[10px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Amount</th>
                <th className="p-2 w-[20%] text-[10px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">GST</th>
                <th className="p-2 w-[20%] text-[10px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Total</th>
                <th className="p-2 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 bg-white">
              {data.map((item: any) => (
                <tr key={item.id} className="hover:bg-gray-50 group transition-colors">
                  <td className="p-2 w-10 text-center">
                    <button className="opacity-0 group-hover:opacity-100 text-blue-400 hover:text-blue-600 transition-all">
                      <Edit2 size={12} />
                    </button>
                  </td>
                  <td className="p-2">
                    <input 
                      className="w-full bg-transparent outline-none text-xs" 
                      value={item.date} 
                      placeholder="Date"
                      onChange={(e) => onUpdate(item.id, 'date', e.target.value)}
                    />
                  </td>
                  <td className="p-2">
                    <input 
                      className="w-full bg-transparent outline-none text-xs" 
                      value={item.description} 
                      placeholder="Description"
                      onChange={(e) => onUpdate(item.id, 'description', e.target.value)}
                    />
                  </td>
                  <td className="p-2">
                    <input 
                      type="number"
                      className="w-full bg-transparent outline-none text-xs font-medium" 
                      value={item.amount === 0 ? "" : item.amount} 
                      placeholder="0"
                      onChange={(e) => onUpdate(item.id, 'amount', e.target.value)}
                    />
                  </td>
                  <td className="p-2">
                    <input 
                      type="number"
                      className="w-full bg-transparent outline-none text-xs font-medium" 
                      value={item.gst === 0 ? "" : item.gst} 
                      placeholder="0"
                      onChange={(e) => onUpdate(item.id, 'gst', e.target.value)}
                    />
                  </td>
                  <td className="p-2 text-xs font-bold text-gray-700">₹{item.total}</td>
                  <td className="p-2 w-10 text-center">
                    <button onClick={() => onDelete(item.id)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all">
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 z-10 bg-gray-50 shadow-[0_-1px_0_rgba(0,0,0,0.05)]">
              <tr className="font-bold">
                <td className="w-10"></td>
                <td colSpan={2} className="p-2 text-right text-[10px] text-gray-400">TOTAL</td>
                <td className="p-2 text-xs">₹{totals.amount}</td>
                <td className="p-2 text-xs">₹{totals.gst}</td>
                <td className="p-2 text-xs text-[#1a365d]">₹{totals.total}</td>
                <td className="w-10"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

function LiabilityTable({ title, data, onAdd, onUpdate, onDelete }: any) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
      <div className="bg-[#1a365d] text-white p-3 flex justify-between items-center">
        <h3 className="font-semibold text-sm">{title}</h3>
        <button onClick={onAdd} className="p-1 hover:bg-white/20 rounded transition-colors">
          <Plus size={16} />
        </button>
      </div>
      <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-200">
        <div className="max-h-[250px] overflow-y-auto relative">
          <table className="w-full text-left border-collapse min-w-[600px] table-fixed">
            <thead className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_rgba(0,0,0,0.05)]">
              <tr>
                <th className="p-2 w-10"></th>
                <th className="p-2 w-[25%] text-[10px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Date</th>
                <th className="p-2 w-[25%] text-[10px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Account</th>
                <th className="p-2 w-[25%] text-[10px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Description</th>
                <th className="p-2 w-[25%] text-[10px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Amount</th>
                <th className="p-2 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 bg-white">
              {data.map((item: any) => (
                <tr key={item.id} className="hover:bg-gray-50 group transition-colors">
                  <td className="p-2 w-10 text-center">
                    <button className="opacity-0 group-hover:opacity-100 text-blue-400 hover:text-blue-600 transition-all">
                      <Edit2 size={12} />
                    </button>
                  </td>
                  <td className="p-2">
                    <input 
                      className="w-full bg-transparent outline-none text-xs" 
                      value={item.date} 
                      placeholder="Date"
                      onChange={(e) => onUpdate(item.id, 'date', e.target.value)} 
                    />
                  </td>
                  <td className="p-2">
                    <input 
                      className="w-full bg-transparent outline-none text-xs" 
                      value={item.account} 
                      placeholder="Account"
                      onChange={(e) => onUpdate(item.id, 'account', e.target.value)} 
                    />
                  </td>
                  <td className="p-2">
                    <input 
                      className="w-full bg-transparent outline-none text-xs" 
                      value={item.description} 
                      placeholder="Description"
                      onChange={(e) => onUpdate(item.id, 'description', e.target.value)} 
                    />
                  </td>
                  <td className="p-2">
                    <input 
                      type="number" 
                      className="w-full bg-transparent outline-none text-xs font-medium" 
                      value={item.amount === 0 ? "" : item.amount} 
                      placeholder="0"
                      onChange={(e) => onUpdate(item.id, 'amount', e.target.value)} 
                    />
                  </td>
                  <td className="p-2 w-10 text-center">
                    <button onClick={() => onDelete(item.id)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all">
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
