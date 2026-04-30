import React, { useState, useEffect } from 'react';
import { UserPlus, Save, Trash, UserCircle, KeyRound, Shield } from 'lucide-react';
import { apiFetch } from '../services/db';

interface User {
  id: string;
  username: string;
  role: string;
  profilePic?: string;
  bio?: string;
  createdAt: string;
}

export function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'User' });
  const [isCreating, setIsCreating] = useState(false);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/users');
      const data = await res.json();
      setUsers(data);
    } catch (e: any) {
      setError(e.message || 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreate = async () => {
    if (!newUser.username || !newUser.password) {
       setError("Username and Password are required");
       return;
    }
    setIsCreating(true);
    setError(null);
    try {
       const res = await apiFetch('/api/users', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(newUser)
       });
       if (!res.ok) {
         const data = await res.json().catch(() => ({}));
         throw new Error(data.error || 'Failed to create user');
       }
       setNewUser({ username: '', password: '', role: 'User' });
       await loadUsers();
    } catch (e: any) {
       setError(e.message || 'Failed to create user');
    } finally {
       setIsCreating(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {error && (
         <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-xl text-sm">
           {error}
         </div>
      )}

      {/* Create User Form */}
      <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-5 space-y-4">
         <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest flex items-center gap-2 mb-2">
           <UserPlus className="w-4 h-4 text-indigo-400" /> Create New Account
         </h3>
         
         <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
           <div>
             <label className="block text-xs font-medium text-zinc-500 mb-1">Username</label>
             <input value={newUser.username} onChange={(e) => setNewUser(p => ({...p, username: e.target.value}))} className="input-field py-2 text-sm" placeholder="New user..." />
           </div>
           <div>
             <label className="block text-xs font-medium text-zinc-500 mb-1">Password</label>
             <input type="password" value={newUser.password} onChange={(e) => setNewUser(p => ({...p, password: e.target.value}))} className="input-field py-2 text-sm" placeholder="••••••••" />
           </div>
           <div className="flex items-end gap-3">
             <div className="flex-1">
               <label className="block text-xs font-medium text-zinc-500 mb-1">Role</label>
               <select value={newUser.role} onChange={(e) => setNewUser(p => ({...p, role: e.target.value}))} className="input-field py-2 text-sm w-full bg-zinc-900 appearance-none">
                 <option value="User">User</option>
                 <option value="Admin">Admin</option>
               </select>
             </div>
             <button 
               type="button"
               disabled={isCreating}
               onClick={handleCreate}
               className="h-[38px] px-4 flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors font-medium text-sm disabled:opacity-50"
             >
               {isCreating ? 'Creating...' : 'Create'}
             </button>
           </div>
         </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest">Existing Users</h3>
        {isLoading ? (
          <div className="flex justify-center py-10"><div className="animate-spin w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full" /></div>
        ) : (
          <div className="grid gap-3">
            {users.map(u => (
               <div key={u.id} className="flex items-center justify-between p-4 bg-zinc-900/40 border border-white/5 rounded-xl hover:bg-white/5 transition-colors">
                 <div className="flex items-center gap-4">
                   <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden border border-white/10 shrink-0">
                     {u.profilePic ? (
                       <img src={u.profilePic} 
                            alt={u.username} 
                            className="w-full h-full object-cover"
                       />
                     ) : (
                       <UserCircle className="w-6 h-6 text-zinc-600" />
                     )}
                   </div>
                   <div>
                     <div className="flex items-center gap-2">
                       <h4 className="font-medium text-zinc-200">{u.username}</h4>
                       <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider ${u.role === 'Admin' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-zinc-800 text-zinc-400 border border-zinc-700'}`}>
                         {u.role === 'Admin' ? <Shield className="w-2.5 h-2.5 inline mr-1 -mt-0.5" /> : null}
                         {u.role}
                       </span>
                     </div>
                     <p className="text-xs text-zinc-500">Joined {new Date(u.createdAt).toLocaleDateString()}</p>
                   </div>
                 </div>
                 
                 {/* For now, just a display. Editing existing users from Admin UI could be added in the future */}
                 <div className="text-xs text-zinc-500 flex items-center gap-2 cursor-help" title="To edit, user must sign into their profile.">
                   <KeyRound className="w-3.5 h-3.5" /> Managed
                 </div>
               </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
