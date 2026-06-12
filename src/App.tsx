/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from "react";
import { useState, useMemo, useEffect, createContext, useContext, Component, useCallback, useRef } from "react";
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
  AlertCircle,
  Undo2,
  Redo2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// --- API Fetch Helper ---
const apiFetch = async (url: string, options: any = {}) => {
  const token = localStorage.getItem('fintech_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }
  return response.json();
};

// --- Types ---

interface User {
  uid: string;
  email: string;
}

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number | string;
  gst: number | string;
  total: number | string;
  type?: 'income' | 'expense';
  userId?: string;
  createdAt?: string;
}

interface Liability {
  id: string;
  date: string;
  account: string;
  description: string;
  amount: number | string;
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

interface HistoryState {
  income: Transaction[];
  expense: Transaction[];
  liabilityCredit: Liability[];
  liabilityDebit: Liability[];
}

interface DueSummary {
  account: string;
  amount: number;
}

// --- Auth Context ---

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email?: string, password?: string) => Promise<void>;
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

  const login = async (email?: string, password?: string) => {
    setAuthError(null);
    setLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email || 'demo@example.com',
          password: password || 'Numasoft@#2!'
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Login failed');
      }

      const data = await response.json();
      localStorage.setItem('fintech_token', data.token);
      localStorage.setItem('fintech_user', JSON.stringify(data.user));
      
      // Sync local storage data if exists
      const localTx = localStorage.getItem(`transactions_local-user`);
      const localLiab = localStorage.getItem(`liabilities_local-user`);
      const localAcc = localStorage.getItem(`accounts_local-user`);

      if (localTx || localLiab || localAcc) {
        try {
          await fetch('/api/sync', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${data.token}`
            },
            body: JSON.stringify({
              transactions: localTx ? JSON.parse(localTx) : [],
              liabilities: localLiab ? JSON.parse(localLiab) : [],
              accounts: localAcc ? JSON.parse(localAcc) : []
            })
          });
          // Clean up local storage keys so we don't sync again
          localStorage.removeItem(`transactions_local-user`);
          localStorage.removeItem(`liabilities_local-user`);
          localStorage.removeItem(`accounts_local-user`);
        } catch (syncErr) {
          console.error("Failed to sync local data:", syncErr);
        }
      }

      setUser(data.user);
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setUser(null);
    localStorage.removeItem('fintech_user');
    localStorage.removeItem('fintech_token');
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

// --- Constants ---
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// --- Precision Math Helper ---
const formatCurrency = (num: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(num);
};

const preciseAdd = (a: number | string, b: number | string) => {
  const valA = Number(a) || 0;
  const valB = Number(b) || 0;
  return Math.round((valA + valB) * 100) / 100;
};

const preciseSub = (a: number | string, b: number | string) => {
  const valA = Number(a) || 0;
  const valB = Number(b) || 0;
  return Math.round((valA - valB) * 100) / 100;
};

const preciseMul = (a: number | string, b: number | string) => {
  const valA = Number(a) || 0;
  const valB = Number(b) || 0;
  return Math.round((valA * valB) * 100) / 100;
};

const getOrdinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
};

const formatReadableDate = (day: number, month: string) => {
  return `${day}${getOrdinal(day)} ${month}`;
};

const formatIfISO = (dateStr: string) => {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  // Check if it's a valid date and looks like an ISO string (contains 'T')
  if (!isNaN(date.getTime()) && dateStr.includes('T')) {
    const day = date.getDate();
    const month = MONTHS[date.getMonth()];
    return formatReadableDate(day, month);
  }
  return dateStr;
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

  // --- Undo/Redo State ---
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const pushToHistory = (newState: HistoryState) => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(newState);
      if (newHistory.length > 50) newHistory.shift();
      return newHistory;
    });
    setHistoryIndex(prev => {
      const nextIdx = prev + 1;
      return nextIdx > 49 ? 49 : nextIdx;
    });
  };

  const undo = useCallback(async () => {
    if (historyIndex > 0) {
      const prevState = history[historyIndex - 1];
      setIncome(prevState.income);
      setExpense(prevState.expense);
      setLiabilityCredit(prevState.liabilityCredit);
      setLiabilityDebit(prevState.liabilityDebit);
      setHistoryIndex(historyIndex - 1);
      
      try {
        await apiFetch('/api/sync/overwrite', {
          method: 'POST',
          body: JSON.stringify({
            transactions: [...prevState.income.map(i => ({ ...i, type: 'income' })), ...prevState.expense.map(e => ({ ...e, type: 'expense' }))],
            liabilities: [...prevState.liabilityCredit.map(c => ({ ...c, type: 'credit' })), ...prevState.liabilityDebit.map(d => ({ ...d, type: 'debit' }))]
          })
        });
      } catch (err) {
        console.error("Undo DB sync failed:", err);
      }
    }
  }, [historyIndex, history, user]);

  const redo = useCallback(async () => {
    if (historyIndex < history.length - 1) {
      const nextState = history[historyIndex + 1];
      setIncome(nextState.income);
      setExpense(nextState.expense);
      setLiabilityCredit(nextState.liabilityCredit);
      setLiabilityDebit(nextState.liabilityDebit);
      setHistoryIndex(historyIndex + 1);

      try {
        await apiFetch('/api/sync/overwrite', {
          method: 'POST',
          body: JSON.stringify({
            transactions: [...nextState.income.map(i => ({ ...i, type: 'income' })), ...nextState.expense.map(e => ({ ...e, type: 'expense' }))],
            liabilities: [...nextState.liabilityCredit.map(c => ({ ...c, type: 'credit' })), ...nextState.liabilityDebit.map(d => ({ ...d, type: 'debit' }))]
          })
        });
      } catch (err) {
        console.error("Redo DB sync failed:", err);
      }
    }
  }, [historyIndex, history, user]);

  // --- Database Initial Load ---
  useEffect(() => {
    if (!user) return;

    const loadData = async () => {
      try {
        const [dbTransactions, dbLiabilities, dbAccounts] = await Promise.all([
          apiFetch('/api/transactions'),
          apiFetch('/api/liabilities'),
          apiFetch('/api/accounts')
        ]);

        if (dbTransactions.length === 0 && dbLiabilities.length === 0 && dbAccounts.length === 0) {
          const initials = {
            transactions: [
              ...INITIAL_INCOME.map(t => ({ ...t, type: 'income' })),
              ...INITIAL_EXPENSE.map(t => ({ ...t, type: 'expense' }))
            ],
            liabilities: [
              ...INITIAL_LIABILITY_CREDIT.map(l => ({ ...l, type: 'credit' })),
              ...INITIAL_LIABILITY_DEBIT.map(l => ({ ...l, type: 'debit' }))
            ],
            accounts: INITIAL_ACCOUNTS
          };
          
          await apiFetch('/api/sync', {
            method: 'POST',
            body: JSON.stringify(initials)
          });
          
          // Re-load
          const [newTx, newLiab, newAcc] = await Promise.all([
            apiFetch('/api/transactions'),
            apiFetch('/api/liabilities'),
            apiFetch('/api/accounts')
          ]);
          
          const formattedTx = newTx.map((t: any) => ({ ...t, date: formatIfISO(t.date) }));
          const inc = formattedTx.filter((t: any) => t.type === 'income');
          const exp = formattedTx.filter((t: any) => t.type === 'expense');
          setIncome(inc);
          setExpense(exp);

          const formattedLiab = newLiab.map((l: any) => ({ ...l, date: formatIfISO(l.date) }));
          const cr = formattedLiab.filter((l: any) => l.type === 'credit');
          const db = formattedLiab.filter((l: any) => l.type === 'debit');
          setLiabilityCredit(cr);
          setLiabilityDebit(db);

          setAccounts(newAcc);
          setHistory([{ income: inc, expense: exp, liabilityCredit: cr, liabilityDebit: db }]);
          setHistoryIndex(0);
          return;
        }

        const formattedTx = dbTransactions.map((t: any) => ({ ...t, date: formatIfISO(t.date) }));
        const inc = formattedTx.filter((t: any) => t.type === 'income');
        const exp = formattedTx.filter((t: any) => t.type === 'expense');
        setIncome(inc);
        setExpense(exp);

        const formattedLiab = dbLiabilities.map((l: any) => ({ ...l, date: formatIfISO(l.date) }));
        const cr = formattedLiab.filter((l: any) => l.type === 'credit');
        const db = formattedLiab.filter((l: any) => l.type === 'debit');
        setLiabilityCredit(cr);
        setLiabilityDebit(db);

        setAccounts(dbAccounts);
        setHistory([{ income: inc, expense: exp, liabilityCredit: cr, liabilityDebit: db }]);
        setHistoryIndex(0);
      } catch (err: any) {
        console.error("Failed to load data from database:", err);
      }
    };

    loadData();
  }, [user]);

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  // Ref to hold update timeouts for debouncing database writes
  const updateTimeouts = useRef<Record<string, NodeJS.Timeout>>({});

  // --- Date Helpers ---
  const getPeriodRange = useMemo(() => {
    const startMonthIdx = MONTHS.indexOf(currentMonth);
    const startYear = parseInt(currentYear);
    
    const startDate = new Date(startYear, startMonthIdx, 1);
    const endDate = new Date(startYear, startMonthIdx + viewDuration, 0, 23, 59, 59);
    
    return { startDate, endDate };
  }, [currentMonth, currentYear, viewDuration]);

  const parseItemDate = (dateStr: string) => {
    // Try parsing as ISO first
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) return date;

    // Fallback for "2nd April" format
    const parts = dateStr.split(' ');
    if (parts.length >= 2) {
      const day = parseInt(parts[0]);
      const monthName = parts[1];
      const monthIdx = MONTHS.indexOf(monthName);
      if (monthIdx !== -1) {
        // Assume current year if not specified in the string
        return new Date(parseInt(currentYear), monthIdx, day || 1);
      }
    }
    return new Date(0); // Invalid date
  };

  // --- Filtered Data ---
  const filteredIncome = useMemo(() => {
    const { startDate, endDate } = getPeriodRange;
    return income.filter(item => {
      const itemDate = parseItemDate(item.date);
      return itemDate >= startDate && itemDate <= endDate;
    });
  }, [income, getPeriodRange, currentYear]);

  const filteredExpense = useMemo(() => {
    const { startDate, endDate } = getPeriodRange;
    return expense.filter(item => {
      const itemDate = parseItemDate(item.date);
      return itemDate >= startDate && itemDate <= endDate;
    });
  }, [expense, getPeriodRange, currentYear]);

  const filteredLiabilityCredit = useMemo(() => {
    const { endDate } = getPeriodRange;
    // For liabilities, we want everything UP TO the end of the period (cumulative carry-forward)
    return liabilityCredit.filter(item => {
      const itemDate = parseItemDate(item.date);
      return itemDate <= endDate;
    });
  }, [liabilityCredit, getPeriodRange, currentYear]);

  const filteredLiabilityDebit = useMemo(() => {
    const { endDate } = getPeriodRange;
    // For liabilities, we want everything UP TO the end of the period (cumulative carry-forward)
    return liabilityDebit.filter(item => {
      const itemDate = parseItemDate(item.date);
      return itemDate <= endDate;
    });
  }, [liabilityDebit, getPeriodRange, currentYear]);

  // --- Aggregated Due Summary ---
  const aggregatedDueSummary = useMemo(() => {
    const dues: Record<string, number> = {};
    
    filteredLiabilityCredit.forEach(item => {
      const account = item.account.trim();
      if (!account) return;
      dues[account] = preciseAdd(dues[account] || 0, item.amount);
    });
    
    filteredLiabilityDebit.forEach(item => {
      const account = item.account.trim();
      if (!account) return;
      dues[account] = preciseSub(dues[account] || 0, item.amount);
    });

    return Object.entries(dues)
      .filter(([_, amount]) => amount !== 0)
      .map(([account, amount]) => ({ account, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredLiabilityCredit, filteredLiabilityDebit]);

  // --- Advanced Calculation Engine ---
  const calculations = useMemo(() => {
    const totalIncome = filteredIncome.reduce((acc, curr) => preciseAdd(acc, curr.total), 0);
    const totalExpense = filteredExpense.reduce((acc, curr) => preciseAdd(acc, curr.total), 0);
    const gstInput = filteredIncome.reduce((acc, curr) => preciseAdd(acc, curr.gst), 0);
    const gstOutput = filteredExpense.reduce((acc, curr) => preciseAdd(acc, curr.gst), 0);
    
    const gstPayable = preciseSub(gstInput, gstOutput);
    const profitLoss = preciseSub(totalIncome, totalExpense);
    const profitLossPercent = totalIncome > 0 ? (profitLoss / totalIncome) * 100 : 0;

    // Projections (based on the selected month's data, not the whole period)
    const singleMonthIncome = income.filter(item => {
      const itemDate = parseItemDate(item.date);
      return itemDate.getMonth() === MONTHS.indexOf(currentMonth) && 
             itemDate.getFullYear() === parseInt(currentYear);
    }).reduce((acc, curr) => preciseAdd(acc, curr.total), 0);

    const projectedAnnual = preciseMul(singleMonthIncome, 12);
    const monthlyAverage = viewDuration > 0 ? totalIncome / viewDuration : 0;

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
  }, [filteredIncome, filteredExpense, income, currentMonth, currentYear, viewDuration]);

  // Handlers
  const addIncome = async (data?: Partial<Transaction>) => {
    if (!user) return;
    const day = new Date().getDate();
    try {
      const created = await apiFetch('/api/transactions', {
        method: 'POST',
        body: JSON.stringify({
          date: formatReadableDate(day, currentMonth),
          description: data?.description || "",
          amount: Number(data?.amount) || 0,
          gst: Number(data?.gst) || 0,
          total: preciseAdd(Number(data?.amount || 0), Number(data?.gst || 0)),
          type: 'income',
        })
      });
      const updated = [...income, created];
      setIncome(updated);
      pushToHistory({ income: updated, expense, liabilityCredit, liabilityDebit });
    } catch (err: any) {
      alert("Failed to add transaction: " + err.message);
    }
  };

  const addExpense = async (data?: Partial<Transaction>) => {
    if (!user) return;
    const day = new Date().getDate();
    try {
      const created = await apiFetch('/api/transactions', {
        method: 'POST',
        body: JSON.stringify({
          date: formatReadableDate(day, currentMonth),
          description: data?.description || "",
          amount: Number(data?.amount) || 0,
          gst: Number(data?.gst) || 0,
          total: preciseAdd(Number(data?.amount || 0), Number(data?.gst || 0)),
          type: 'expense',
        })
      });
      const updated = [...expense, created];
      setExpense(updated);
      pushToHistory({ income, expense: updated, liabilityCredit, liabilityDebit });
    } catch (err: any) {
      alert("Failed to add transaction: " + err.message);
    }
  };

  const addLiabilityCredit = async (data?: Partial<Liability>) => {
    if (!user) return;
    const day = new Date().getDate();
    try {
      const created = await apiFetch('/api/liabilities', {
        method: 'POST',
        body: JSON.stringify({
          date: formatReadableDate(day, currentMonth),
          account: data?.account || "",
          description: data?.description || "",
          amount: Number(data?.amount) || 0,
          type: 'credit',
        })
      });
      const updated = [...liabilityCredit, created];
      setLiabilityCredit(updated);
      pushToHistory({ income, expense, liabilityCredit: updated, liabilityDebit });
    } catch (err: any) {
      alert("Failed to add liability: " + err.message);
    }
  };

  const addLiabilityDebit = async (data?: Partial<Liability>) => {
    if (!user) return;
    const day = new Date().getDate();
    try {
      const created = await apiFetch('/api/liabilities', {
        method: 'POST',
        body: JSON.stringify({
          date: formatReadableDate(day, currentMonth),
          account: data?.account || "",
          description: data?.description || "",
          amount: Number(data?.amount) || 0,
          type: 'debit',
        })
      });
      const updated = [...liabilityDebit, created];
      setLiabilityDebit(updated);
      pushToHistory({ income, expense, liabilityCredit, liabilityDebit: updated });
    } catch (err: any) {
      alert("Failed to add liability: " + err.message);
    }
  };

  const addAccount = async () => {
    if (!user) return;
    const name = prompt("Enter account name:");
    if (name) {
      try {
        const created = await apiFetch('/api/accounts', {
          method: 'POST',
          body: JSON.stringify({ name })
        });
        setAccounts(prev => [...prev, created]);
      } catch (err: any) {
        alert("Failed to add account: " + err.message);
      }
    }
  };

  const debounceUpdateTransaction = (tx: Transaction) => {
    if (updateTimeouts.current[tx.id]) {
      clearTimeout(updateTimeouts.current[tx.id]);
    }
    updateTimeouts.current[tx.id] = setTimeout(async () => {
      try {
        await apiFetch(`/api/transactions/${tx.id}`, {
          method: 'PUT',
          body: JSON.stringify(tx)
        });
      } catch (err) {
        console.error("Failed to update transaction in database:", err);
      }
    }, 500);
  };

  const debounceUpdateLiability = (liab: Liability) => {
    if (updateTimeouts.current[liab.id]) {
      clearTimeout(updateTimeouts.current[liab.id]);
    }
    updateTimeouts.current[liab.id] = setTimeout(async () => {
      try {
        await apiFetch(`/api/liabilities/${liab.id}`, {
          method: 'PUT',
          body: JSON.stringify(liab)
        });
      } catch (err) {
        console.error("Failed to update liability in database:", err);
      }
    }, 500);
  };

  const updateTransaction = async (type: 'income' | 'expense', id: string, field: keyof Transaction, value: any) => {
    const list = type === 'income' ? income : expense;
    let updatedTx: Transaction | null = null;
    const updatedList = list.map(t => {
      if (t.id === id) {
        const newT = { ...t, [field]: value };
        if (field === 'amount' || field === 'gst') {
          newT.total = preciseAdd(newT.amount, newT.gst);
        }
        updatedTx = newT;
        return newT;
      }
      return t;
    });

    if (type === 'income') {
      setIncome(updatedList);
    } else {
      setExpense(updatedList);
    }

    if (updatedTx) {
      debounceUpdateTransaction(updatedTx);
    }
  };

  const updateLiability = async (type: 'credit' | 'debit', id: string, field: keyof Liability, value: any) => {
    const list = type === 'credit' ? liabilityCredit : liabilityDebit;
    let updatedLiab: Liability | null = null;
    const updatedList = list.map(l => {
      if (l.id === id) {
        const newL = { ...l, [field]: value };
        updatedLiab = newL;
        return newL;
      }
      return l;
    });

    if (type === 'credit') {
      setLiabilityCredit(updatedList);
    } else {
      setLiabilityDebit(updatedList);
    }

    if (updatedLiab) {
      debounceUpdateLiability(updatedLiab);
    }
  };

  const deleteTransaction = async (id: string) => {
    try {
      await apiFetch(`/api/transactions/${id}`, {
        method: 'DELETE'
      });
      const newIncome = income.filter(t => t.id !== id);
      const newExpense = expense.filter(t => t.id !== id);
      setIncome(newIncome);
      setExpense(newExpense);
      pushToHistory({ income: newIncome, expense: newExpense, liabilityCredit, liabilityDebit });
    } catch (err: any) {
      alert("Failed to delete transaction: " + err.message);
    }
  };

  const deleteLiability = async (id: string) => {
    try {
      await apiFetch(`/api/liabilities/${id}`, {
        method: 'DELETE'
      });
      const newCredit = liabilityCredit.filter(l => l.id !== id);
      const newDebit = liabilityDebit.filter(l => l.id !== id);
      setLiabilityCredit(newCredit);
      setLiabilityDebit(newDebit);
      pushToHistory({ income, expense, liabilityCredit: newCredit, liabilityDebit: newDebit });
    } catch (err: any) {
      alert("Failed to delete liability: " + err.message);
    }
  };

  const deleteAccount = async (id: string) => {
    try {
      await apiFetch(`/api/accounts/${id}`, {
        method: 'DELETE'
      });
      setAccounts(prev => prev.filter(a => a.id !== id));
    } catch (err: any) {
      alert("Failed to delete account: " + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-[#f0f2f5] text-gray-800 font-sans p-2 lg:p-3">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 bg-white p-2 rounded-lg shadow-sm border border-gray-100 gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold text-[#1a365d]">Dashboard</h1>
          <div className="h-4 w-[1px] bg-gray-300 mx-1 hidden md:block"></div>
          <div className="flex items-center gap-1">
            <span className="text-gray-500 font-medium text-xs">Entity ABC</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Undo/Redo Buttons */}
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-md p-0.5">
            <button 
              onClick={undo} 
              disabled={historyIndex <= 0}
              className={`p-1 rounded transition-colors ${historyIndex <= 0 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-100'}`}
              title="Undo (Ctrl+Z)"
            >
              <Undo2 size={14} />
            </button>
            <button 
              onClick={redo} 
              disabled={historyIndex >= history.length - 1}
              className={`p-1 rounded transition-colors ${historyIndex >= history.length - 1 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-100'}`}
              title="Redo (Ctrl+Y)"
            >
              <Redo2 size={14} />
            </button>
          </div>

          {/* Duration Selector */}
          <div className="flex items-center gap-1.5 bg-blue-50 px-2 py-1 rounded-md border border-blue-100">
            <span className="text-[9px] font-bold text-blue-600 uppercase">View Period:</span>
            <select 
              value={viewDuration} 
              onChange={(e) => setViewDuration(Number(e.target.value))}
              className="bg-transparent font-bold text-[0.8em] text-blue-800 outline-none cursor-pointer"
            >
              <option value={1}>1 Month</option>
              <option value={3}>3 Months</option>
              <option value={4}>4 Months</option>
              <option value={6}>6 Months</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-md border border-gray-200">
            <select 
              value={currentMonth} 
              onChange={(e) => setCurrentMonth(e.target.value)}
              className="bg-transparent font-semibold text-[0.8em] outline-none cursor-pointer"
            >
              {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <select 
              value={currentYear} 
              onChange={(e) => setCurrentYear(e.target.value)}
              className="bg-transparent font-semibold text-[0.8em] outline-none cursor-pointer"
            >
              {["2024", "2025", "2026", "2027"].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-1.5 hover:bg-gray-100 rounded-full transition-colors text-gray-600"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Left Column: Summary and Tables */}
        <div className="lg:col-span-9 space-y-3">
          
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryCard 
              title={`Total Income (${viewDuration}m)`} 
              value={formatCurrency(calculations.totalIncome)} 
              icon={<Wallet className="text-blue-600" size={16} />}
              bgColor="bg-blue-50"
              details={viewDuration > 1 ? `Avg: ${formatCurrency(calculations.monthlyAverage)} / mo` : ""}
            />
            <SummaryCard 
              title={`Total Expense (${viewDuration}m)`} 
              value={formatCurrency(calculations.totalExpense)} 
              icon={<Receipt className="text-orange-600" size={16} />}
              bgColor="bg-orange-50"
            />
            <SummaryCard 
              title="Profit/Loss Analysis" 
              value={`${formatCurrency(Math.abs(calculations.profitLoss))} / ${calculations.profitLossPercent.toFixed(2)}%`} 
              isProfit={calculations.profitLoss >= 0}
              icon={<TrendingUp className={calculations.profitLoss >= 0 ? "text-green-600" : "text-red-600"} size={16} />}
              bgColor={calculations.profitLoss >= 0 ? "bg-green-50" : "bg-red-50"}
              details={calculations.profitLoss >= 0 ? "Healthy Margin" : "Critical Deficit"}
            />
            <SummaryCard 
              title="GST Period Summary" 
              value={formatCurrency(calculations.gstPayable)} 
              details={`In: ${formatCurrency(calculations.gstInput)} | Out: ${formatCurrency(calculations.gstOutput)}`}
              icon={<CreditCard className="text-indigo-600" size={16} />}
              bgColor="bg-indigo-50"
            />
          </div>

          {/* Tables Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Income Table */}
            <TableSection 
              title="Income" 
              data={filteredIncome} 
              onAdd={addIncome}
              onUpdate={(id: string, f: any, v: any) => updateTransaction('income', id, f, v)}
              onDelete={deleteTransaction}
              totals={{ 
                amount: filteredIncome.reduce((a,c) => preciseAdd(a, c.amount), 0), 
                gst: filteredIncome.reduce((a,c) => preciseAdd(a, c.gst), 0), 
                total: filteredIncome.reduce((a,c) => preciseAdd(a, c.total), 0) 
              }}
            />

            {/* Expense Table */}
            <TableSection 
              title="Expense" 
              data={filteredExpense} 
              onAdd={addExpense}
              onUpdate={(id: string, f: any, v: any) => updateTransaction('expense', id, f, v)}
              onDelete={deleteTransaction}
              totals={{ 
                amount: filteredExpense.reduce((a,c) => preciseAdd(a, c.amount), 0), 
                gst: filteredExpense.reduce((a,c) => preciseAdd(a, c.gst), 0), 
                total: filteredExpense.reduce((a,c) => preciseAdd(a, c.total), 0) 
              }}
            />

            {/* Liability Credit Table */}
            <LiabilityTable 
              title="Liability Credit" 
              data={filteredLiabilityCredit.filter(l => {
                const d = parseItemDate(l.date);
                return d.getMonth() === MONTHS.indexOf(currentMonth) && d.getFullYear() === parseInt(currentYear);
              })} 
              onAdd={addLiabilityCredit}
              onUpdate={(id: string, f: any, v: any) => updateLiability('credit', id, f, v)}
              onDelete={deleteLiability}
            />

            {/* Liability Debit Table */}
            <LiabilityTable 
              title="Liability Debit" 
              data={filteredLiabilityDebit.filter(l => {
                const d = parseItemDate(l.date);
                return d.getMonth() === MONTHS.indexOf(currentMonth) && d.getFullYear() === parseInt(currentYear);
              })} 
              onAdd={addLiabilityDebit}
              onUpdate={(id: string, f: any, v: any) => updateLiability('debit', id, f, v)}
              onDelete={deleteLiability}
            />
          </div>
        </div>

        {/* Right Column: Side Panels */}
        <div className="lg:col-span-3 space-y-3">
          {/* Accounts Panel */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-[#1a365d] text-white p-2 flex justify-between items-center">
              <h3 className="font-semibold text-[9px]">Accounts</h3>
              <button onClick={addAccount} className="p-1 hover:bg-white/20 rounded transition-colors">
                <Plus size={10} />
              </button>
            </div>
            <div className="p-2 space-y-1.5">
              {accounts.map(acc => (
                <div key={acc.id} className="bg-gray-50 p-1 rounded border border-gray-100 text-[9px] font-medium text-gray-600 flex justify-between items-center group">
                  {acc.name}
                  <button 
                    onClick={() => deleteAccount(acc.id)}
                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all"
                  >
                    <X size={9} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Due Summary Panel */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-[#1a365d] text-white p-2">
              <h3 className="font-semibold text-[9px]">Due to Summary (Cumulative)</h3>
            </div>
            <div className="p-2 space-y-1.5">
              {aggregatedDueSummary.length === 0 ? (
                <p className="text-[9px] text-gray-400 text-center py-1">No outstanding dues</p>
              ) : (
                <>
                  {aggregatedDueSummary.map((due, idx) => (
                    <div key={idx} className="bg-gray-50 p-1 rounded border border-gray-100 text-[9px] font-medium text-gray-600 flex justify-between items-center">
                      <span className="truncate mr-1">{due.account}:</span>
                      <span className={`font-bold ${due.amount > 0 ? 'text-[#1a365d]' : 'text-green-600'}`}>
                        {formatCurrency(due.amount)}
                      </span>
                    </div>
                  ))}
                  <div className="pt-1.5 mt-1.5 border-t border-gray-200 flex justify-between text-[9px] font-bold text-[#1a365d]">
                    <span>TOTAL BALANCE:</span>
                    <span>{formatCurrency(aggregatedDueSummary.reduce((acc, curr) => acc + curr.amount, 0))}</span>
                  </div>
                </>
              )}
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
  const [email, setEmail] = useState('demo@example.com');
  const [password, setPassword] = useState('Numasoft@#2!');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login(email, password);
  };

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
          <p className="text-blue-200 text-sm">Access your financial database</p>
        </div>
        
        <form onSubmit={handleSubmit} className="p-8 space-y-4">
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
                type="button"
                onClick={() => setAuthError(null)}
                className="text-red-400 hover:text-red-600 transition-colors"
              >
                <X size={16} />
              </button>
            </motion.div>
          )}

          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-3 text-gray-400" size={16} />
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-100 rounded-xl pl-12 pr-4 py-3 text-xs outline-none transition-all"
                  placeholder="Enter email"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-3 text-gray-400" size={16} />
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-100 rounded-xl pl-12 pr-4 py-3 text-xs outline-none transition-all"
                  placeholder="Enter password"
                  required
                />
              </div>
            </div>
          </div>

          <button 
            type="submit"
            className="w-full bg-[#1a365d] text-white py-4 rounded-2xl font-bold hover:bg-[#2a4a7d] transition-all flex items-center justify-center gap-3 shadow-lg group mt-2"
          >
            <Lock size={20} className="group-hover:scale-110 transition-transform" />
            Sign In to Database
          </button>

          <p className="text-center text-[10px] text-gray-400">
            Pre-populated with default database test credentials.
          </p>
        </form>
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
    <div className="bg-white p-1.5 rounded-lg shadow-sm border border-gray-100 flex items-center gap-2">
      <div className={`${bgColor} p-1 rounded-md shrink-0`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[8px] font-bold text-gray-400 uppercase tracking-tight truncate leading-none mb-0.5">{title}</p>
        <div className="flex items-baseline gap-1">
          <h4 className="text-xs font-bold text-gray-800 whitespace-nowrap">{value}</h4>
          {percent && (
            <span className={`text-[7px] font-bold px-0.5 py-0 rounded ${isProfit ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {percent}%
            </span>
          )}
        </div>
        {details && (
          <p className="text-[7px] text-gray-400 font-medium truncate leading-none mt-0.5">{details}</p>
        )}
      </div>
    </div>
  );
}

function TableSection({ title, data, onAdd, onUpdate, onDelete, totals }: any) {
  const [quickAdd, setQuickAdd] = useState({ description: '', amount: '', gst: '' });
  const [editingRows, setEditingRows] = useState<Record<string, boolean>>({});

  const isNumeric = (val: any) => {
    if (val === "" || val === undefined || val === null) return true;
    return !isNaN(Number(val)) && isFinite(Number(val));
  };

  const handleAdd = () => {
    if (!quickAdd.description && !quickAdd.amount) return;
    if (!isNumeric(quickAdd.amount) || !isNumeric(quickAdd.gst)) return;
    onAdd(quickAdd);
    setQuickAdd({ description: '', amount: '', gst: '' });
  };

  // Pad data to always show at least 4 rows
  const displayData = [...data];
  while (displayData.length < 4) {
    displayData.push({ id: `empty-${displayData.length}`, isEmpty: true });
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden flex flex-col">
      <div className="bg-[#1a365d] text-white p-2 flex justify-between items-center">
        <h3 className="font-semibold text-xs">{title}</h3>
      </div>
      
      <div className="flex flex-col w-full overflow-hidden">
        {/* Header */}
        <table className="w-full text-left border-collapse table-fixed bg-gray-50 border-b border-gray-100">
          <thead>
            <tr>
              <th className="p-1.5 w-8"></th>
              <th className="p-1.5 w-[15%] text-[9px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Date</th>
              <th className="p-1.5 w-[25%] text-[9px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Description</th>
              <th className="p-1.5 w-[18%] text-[9px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Amount</th>
              <th className="p-1.5 w-[14%] text-[9px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">GST</th>
              <th className="p-1.5 w-[18%] text-[9px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Total</th>
              <th className="p-1.5 w-8"></th>
            </tr>
          </thead>
        </table>

        {/* Scrollable Data Area (4 rows) */}
        <div className="h-[112px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 bg-white">
          <table className="w-full text-left border-collapse table-fixed">
            <tbody className="divide-y divide-gray-50">
              {displayData.map((item: any) => (
                <tr key={item.id} className={`h-[28px] transition-colors ${item.isEmpty ? '' : 'hover:bg-gray-50 group'}`}>
                  <td className="p-1.5 w-8 text-center">
                    {!item.isEmpty && (
                      <button 
                        onClick={() => {
                          if (editingRows[item.id]) {
                            // Visual feedback for "saving"
                            const btn = document.getElementById(`save-${item.id}`);
                            if (btn) {
                              btn.classList.add('text-green-500');
                              setTimeout(() => btn.classList.remove('text-green-500'), 1000);
                            }
                            setEditingRows(prev => ({ ...prev, [item.id]: false }));
                          } else {
                            document.getElementById(`desc-${item.id}`)?.focus();
                            setEditingRows(prev => ({ ...prev, [item.id]: true }));
                          }
                        }}
                        id={`save-${item.id}`}
                        className="text-blue-400 hover:text-blue-600 transition-all"
                        title={editingRows[item.id] ? "Save Changes" : "Edit Row"}
                      >
                        {editingRows[item.id] ? <Save size={10} /> : <Edit2 size={10} />}
                      </button>
                    )}
                  </td>
                  <td className="p-1.5 w-[15%]">
                    {!item.isEmpty && (
                      <input 
                        className="w-full bg-transparent outline-none text-[10px]" 
                        value={item.date} 
                        onChange={(e) => onUpdate(item.id, 'date', e.target.value)}
                        onFocus={() => setEditingRows(prev => ({ ...prev, [item.id]: true }))}
                      />
                    )}
                  </td>
                  <td className="p-1.5 w-[25%]">
                    {!item.isEmpty && (
                      <input 
                        id={`desc-${item.id}`}
                        className="w-full bg-transparent outline-none text-[10px] font-medium" 
                        value={item.description} 
                        onChange={(e) => onUpdate(item.id, 'description', e.target.value)}
                        onFocus={() => setEditingRows(prev => ({ ...prev, [item.id]: true }))}
                      />
                    )}
                  </td>
                  <td className="p-1.5 w-[18%]">
                    {!item.isEmpty && (
                      <input 
                        type="text"
                        className={`w-full bg-transparent outline-none text-[10px] font-medium rounded px-0.5 ${!isNumeric(item.amount) ? 'bg-red-50 border border-red-200 text-red-600' : ''}`} 
                        value={item.amount === 0 ? "" : item.amount} 
                        onChange={(e) => onUpdate(item.id, 'amount', e.target.value)}
                        onFocus={() => setEditingRows(prev => ({ ...prev, [item.id]: true }))}
                      />
                    )}
                  </td>
                  <td className="p-1.5 w-[14%]">
                    {!item.isEmpty && (
                      <input 
                        type="text"
                        className={`w-full bg-transparent outline-none text-[10px] font-medium rounded px-0.5 ${!isNumeric(item.gst) ? 'bg-red-50 border border-red-200 text-red-600' : ''}`} 
                        value={item.gst === 0 ? "" : item.gst} 
                        onChange={(e) => onUpdate(item.id, 'gst', e.target.value)}
                        onFocus={() => setEditingRows(prev => ({ ...prev, [item.id]: true }))}
                      />
                    )}
                  </td>
                  <td className="p-1.5 w-[18%] text-[10px] font-bold text-gray-700">
                    {!item.isEmpty && `₹${item.total}`}
                  </td>
                  <td className="p-1.5 w-8 text-center">
                    {!item.isEmpty && (
                      <button onClick={() => onDelete(item.id)} className="text-red-400 hover:text-red-600 transition-all">
                        <Trash2 size={10} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 5th Row: Input Row */}
        <table className="w-full text-left border-collapse table-fixed border-t border-gray-100 bg-blue-50/30">
          <tbody>
            <tr className="h-[32px]">
              <td className="p-1.5 w-8 text-center">
                <Plus size={10} className="text-blue-400 mx-auto" />
              </td>
              <td className="p-1.5 w-[15%]">
                <div className="w-full bg-white/50 border border-blue-100 rounded px-1.5 py-0.5 text-[9px] text-gray-400 italic">
                  Auto Date
                </div>
              </td>
              <td className="p-1.5 w-[25%]">
                <input 
                  className="w-full bg-white border border-blue-200 rounded px-1.5 py-0.5 text-[10px] outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all placeholder:text-gray-300" 
                  placeholder="Add description..."
                  value={quickAdd.description}
                  onChange={(e) => setQuickAdd({...quickAdd, description: e.target.value})}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                />
              </td>
              <td className="p-1.5 w-[18%]">
                <input 
                  type="text"
                  className={`w-full bg-white border rounded px-1.5 py-0.5 text-[10px] outline-none transition-all placeholder:text-gray-300 ${!isNumeric(quickAdd.amount) ? 'border-red-300 bg-red-50 text-red-600' : 'border-blue-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-100'}`} 
                  placeholder="0"
                  value={quickAdd.amount}
                  onChange={(e) => setQuickAdd({...quickAdd, amount: e.target.value})}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                />
              </td>
              <td className="p-1.5 w-[14%]">
                <input 
                  type="text"
                  className={`w-full bg-white border rounded px-1.5 py-0.5 text-[10px] outline-none transition-all placeholder:text-gray-300 ${!isNumeric(quickAdd.gst) ? 'border-red-300 bg-red-50 text-red-600' : 'border-blue-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-100'}`} 
                  placeholder="0"
                  value={quickAdd.gst}
                  onChange={(e) => setQuickAdd({...quickAdd, gst: e.target.value})}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                />
              </td>
              <td className="p-1.5 w-[18%]">
                <button 
                  onClick={handleAdd}
                  className="w-full text-[9px] font-bold text-blue-600 hover:text-blue-800 bg-blue-100/50 hover:bg-blue-100 border border-blue-200 rounded py-0.5 transition-colors"
                >
                  ADD
                </button>
              </td>
              <td className="p-1.5 w-8"></td>
            </tr>
          </tbody>
        </table>

        {/* 6th Row: Total Row */}
        <table className="w-full text-left border-collapse table-fixed bg-gray-50 border-t border-gray-200">
          <tfoot>
            <tr className="h-[28px] font-bold">
              <td className="w-8"></td>
              <td colSpan={2} className="p-1.5 text-right text-[9px] text-gray-400">TOTAL</td>
              <td className="p-1.5 w-[18%] text-[10px]">₹{totals.amount}</td>
              <td className="p-1.5 w-[14%] text-[10px]">₹{totals.gst}</td>
              <td className="p-1.5 w-[18%] text-[10px] text-[#1a365d]">₹{totals.total}</td>
              <td className="w-8"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function LiabilityTable({ title, data, onAdd, onUpdate, onDelete }: any) {
  const [quickAdd, setQuickAdd] = useState({ account: '', description: '', amount: '' });
  const [editingRows, setEditingRows] = useState<Record<string, boolean>>({});

  const isNumeric = (val: any) => {
    if (val === "" || val === undefined || val === null) return true;
    return !isNaN(Number(val)) && isFinite(Number(val));
  };

  const handleAdd = () => {
    if (!quickAdd.account && !quickAdd.amount) return;
    if (!isNumeric(quickAdd.amount)) return;
    onAdd(quickAdd);
    setQuickAdd({ account: '', description: '', amount: '' });
  };

  const displayData = [...data];
  while (displayData.length < 4) {
    displayData.push({ id: `empty-${displayData.length}`, isEmpty: true });
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden flex flex-col">
      <div className="bg-[#1a365d] text-white p-2 flex justify-between items-center">
        <h3 className="font-semibold text-xs">{title}</h3>
      </div>

      <div className="flex flex-col w-full overflow-hidden">
        {/* Header */}
        <table className="w-full text-left border-collapse table-fixed bg-gray-50 border-b border-gray-100">
          <thead>
            <tr>
              <th className="p-1.5 w-8"></th>
              <th className="p-1.5 w-[20%] text-[9px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Date</th>
              <th className="p-1.5 w-[22%] text-[9px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Account</th>
              <th className="p-1.5 w-[25%] text-[9px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Description</th>
              <th className="p-1.5 w-[18%] text-[9px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Amount</th>
              <th className="p-1.5 w-8"></th>
            </tr>
          </thead>
        </table>

        {/* Scrollable Data Area (4 rows) */}
        <div className="h-[112px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 bg-white">
          <table className="w-full text-left border-collapse table-fixed">
            <tbody className="divide-y divide-gray-50">
              {displayData.map((item: any) => (
                <tr key={item.id} className={`h-[28px] transition-colors ${item.isEmpty ? '' : 'hover:bg-gray-50 group'}`}>
                  <td className="p-1.5 w-8 text-center">
                    {!item.isEmpty && (
                      <button 
                        onClick={() => {
                          if (editingRows[item.id]) {
                            const btn = document.getElementById(`save-liab-${item.id}`);
                            if (btn) {
                              btn.classList.add('text-green-500');
                              setTimeout(() => btn.classList.remove('text-green-500'), 1000);
                            }
                            setEditingRows(prev => ({ ...prev, [item.id]: false }));
                          } else {
                            document.getElementById(`liab-${item.id}`)?.focus();
                            setEditingRows(prev => ({ ...prev, [item.id]: true }));
                          }
                        }}
                        id={`save-liab-${item.id}`}
                        className="text-blue-400 hover:text-blue-600 transition-all"
                        title={editingRows[item.id] ? "Save Changes" : "Edit Row"}
                      >
                        {editingRows[item.id] ? <Save size={10} /> : <Edit2 size={10} />}
                      </button>
                    )}
                  </td>
                  <td className="p-1.5 w-[20%]">
                    {!item.isEmpty && (
                      <input 
                        className="w-full bg-transparent outline-none text-[10px]" 
                        value={item.date} 
                        onChange={(e) => onUpdate(item.id, 'date', e.target.value)} 
                        onFocus={() => setEditingRows(prev => ({ ...prev, [item.id]: true }))}
                      />
                    )}
                  </td>
                  <td className="p-1.5 w-[22%]">
                    {!item.isEmpty && (
                      <input 
                        id={`liab-${item.id}`}
                        className="w-full bg-transparent outline-none text-[10px] font-medium" 
                        value={item.account} 
                        onChange={(e) => onUpdate(item.id, 'account', e.target.value)} 
                        onFocus={() => setEditingRows(prev => ({ ...prev, [item.id]: true }))}
                      />
                    )}
                  </td>
                  <td className="p-1.5 w-[25%]">
                    {!item.isEmpty && (
                      <input 
                        className="w-full bg-transparent outline-none text-[10px]" 
                        value={item.description} 
                        onChange={(e) => onUpdate(item.id, 'description', e.target.value)} 
                        onFocus={() => setEditingRows(prev => ({ ...prev, [item.id]: true }))}
                      />
                    )}
                  </td>
                  <td className="p-1.5 w-[18%]">
                    {!item.isEmpty && (
                      <input 
                        type="text" 
                        className={`w-full bg-transparent outline-none text-[10px] font-medium rounded px-0.5 ${!isNumeric(item.amount) ? 'bg-red-50 border border-red-200 text-red-600' : ''}`} 
                        value={item.amount === 0 ? "" : item.amount} 
                        onChange={(e) => onUpdate(item.id, 'amount', e.target.value)} 
                        onFocus={() => setEditingRows(prev => ({ ...prev, [item.id]: true }))}
                      />
                    )}
                  </td>
                  <td className="p-1.5 w-8 text-center">
                    {!item.isEmpty && (
                      <button onClick={() => onDelete(item.id)} className="text-red-400 hover:text-red-600 transition-all">
                        <Trash2 size={10} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 5th Row: Input Row */}
        <table className="w-full text-left border-collapse table-fixed border-t border-gray-100 bg-blue-50/30">
          <tbody>
            <tr className="h-[32px]">
              <td className="p-1.5 w-8 text-center">
                <Plus size={10} className="text-blue-400 mx-auto" />
              </td>
              <td className="p-1.5 w-[20%]">
                <div className="w-full bg-white/50 border border-blue-100 rounded px-1.5 py-0.5 text-[9px] text-gray-400 italic">
                  Auto Date
                </div>
              </td>
              <td className="p-1.5 w-[22%]">
                <input 
                  className="w-full bg-white border border-blue-200 rounded px-1.5 py-0.5 text-[10px] outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all placeholder:text-gray-300" 
                  placeholder="Account..."
                  value={quickAdd.account}
                  onChange={(e) => setQuickAdd({...quickAdd, account: e.target.value})}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                />
              </td>
              <td className="p-1.5 w-[25%]">
                <input 
                  className="w-full bg-white border border-blue-200 rounded px-1.5 py-0.5 text-[10px] outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all placeholder:text-gray-300" 
                  placeholder="Description..."
                  value={quickAdd.description}
                  onChange={(e) => setQuickAdd({...quickAdd, description: e.target.value})}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                />
              </td>
              <td className="p-1.5 w-[18%]">
                <input 
                  type="text"
                  className={`w-full bg-white border rounded px-1.5 py-0.5 text-[10px] outline-none transition-all placeholder:text-gray-300 ${!isNumeric(quickAdd.amount) ? 'border-red-300 bg-red-50 text-red-600' : 'border-blue-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-100'}`} 
                  placeholder="0"
                  value={quickAdd.amount}
                  onChange={(e) => setQuickAdd({...quickAdd, amount: e.target.value})}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                />
              </td>
              <td className="p-1.5 w-8 text-center">
                <button 
                  onClick={handleAdd}
                  className="w-full text-[9px] font-bold text-blue-600 hover:text-blue-800 bg-blue-100/50 hover:bg-blue-100 border border-blue-200 rounded py-0.5 transition-colors"
                >
                  ADD
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        {/* 6th Row: Total Row (Placeholder for consistency) */}
        <table className="w-full text-left border-collapse table-fixed bg-gray-50 border-t border-gray-200">
          <tfoot>
            <tr className="h-[28px] font-bold">
              <td className="w-8"></td>
              <td colSpan={3} className="p-1.5 text-right text-[9px] text-gray-400 uppercase">Monthly Total</td>
              <td className="p-1.5 w-[18%] text-[10px] text-[#1a365d]">
                ₹{data.reduce((acc: number, curr: any) => acc + (Number(curr.amount) || 0), 0)}
              </td>
              <td className="w-8"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
