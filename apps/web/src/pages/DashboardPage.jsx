import React, { useState, useEffect } from "react";
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell 
} from "recharts";
import { 
  Activity, Database, Globe, Zap, Clock, ShieldCheck, ArrowLeft, RefreshCw, AlertTriangle
} from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";

import ENDPOINTS from "../services/endpoints";

const COLORS = ["#FFFFFF", "#D4D4D4", "#A3A3A3", "#737373", "#525252", "#404040"];

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [queueStatus, setQueueStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const fetchData = async () => {
    try {
      const [statsRes, queueRes] = await Promise.all([
        fetch(`${ENDPOINTS.API_BASE_URL}/api/runs/health/stats`),
        fetch(`${ENDPOINTS.API_BASE_URL}/api/runs/health/queue`)
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (queueRes.ok) setQueueStatus(await queueRes.json());
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Failed to fetch dashboard data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 10000);
    return () => clearInterval(timer);
  }, []);

  const formatBytes = (bytes) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  if (loading && !stats) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="h-8 w-8 animate-spin text-white/40" />
          <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/40">Initialising SRE Metrics...</span>
        </div>
      </div>
    );
  }

  const rateRaw = stats?.executionStats?.reduce((acc, curr) => acc + curr.successRate, 0) / (stats?.executionStats?.length || 1);
  const overallSuccessRate = isNaN(rateRaw) ? 0 : rateRaw;

  return (
    <div className="relative min-h-screen w-full p-4 md:p-8 font-sans text-white overflow-hidden selection:bg-white/10" style={{ background: 'var(--sam-bg)' }}>
      <div className="bg-mesh" />
      <div className="noise-overlay" />

      {/* Header */}
      <header className="relative z-20 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to="/" className="group flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 transition-all hover:bg-white/10">
            <ArrowLeft className="h-5 w-5 text-white/40 transition-colors group-hover:text-white" />
          </Link>
          <div>
              <h1 className="text-2xl font-black tracking-tight" style={{ fontFamily: 'var(--font-display)', color: '#dde2f1' }}>System Observability</h1>
              <div className="flex items-center gap-2" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(221,226,241,0.25)' }}>
                <span className="flex h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
                SAM Metrics · Last updated {lastUpdated.toLocaleTimeString()}
              </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
           <div className="flex h-10 items-center gap-2 rounded-xl px-4" style={{ border: '1px solid var(--sam-glass-border)', background: 'rgba(255,255,255,0.05)' }}>
             <ShieldCheck className="h-4 w-4 text-[var(--sam-accent)]" />
             <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.7)', fontFamily: 'var(--font-body)' }}>SAM Engine v1.0</span>
           </div>
        </div>
      </header>

      {/* KPI Section */}
      <div className="relative z-20 mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard 
          icon={<Activity className="text-white" />} 
          title="Availability" 
          value={queueStatus?.workerOnline ? "100%" : "Degraded"} 
          subtext={queueStatus?.workerOnline ? "Worker node active" : "Cloud fallback active"}
          color="white"
        />
        <KpiCard 
          icon={<Zap className="text-white" />} 
          title="Success Rate" 
          value={`${(overallSuccessRate || 0).toFixed(1)}%`} 
          subtext="Last 24 hours"
          color="white"
        />
        <KpiCard 
          icon={<Clock className="text-white/60" />} 
          title="Avg Latency" 
          value={`${(stats?.executionStats?.[0]?.avgDurationMs || 0).toFixed(0)} ms`} 
          subtext="Across all runtimes"
          color="white"
        />
        <KpiCard 
          icon={<Database className="text-white/60" />} 
          title="Throughput" 
          value={stats?.executionStats?.reduce((a, b) => a + b.count, 0) || 0} 
          subtext="Runs in last 24h"
          color="white"
        />
      </div>

      <div className="relative z-20 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Main Charts */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <section className="glass-card flex flex-col p-6 h-[400px]">
             <div className="mb-6 flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white/60">Platform Throughput</h3>
                <span className="text-[10px] text-white/30">Last 7 Days</span>
             </div>
             <div className="flex-1">
                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <AreaChart data={stats?.throughput}>
                    <defs>
                      <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#FFFFFF" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#FFFFFF" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                    <XAxis dataKey="date" stroke="#ffffff20" fontSize={10} tickMargin={10} axisLine={false} tickLine={false} />
                    <YAxis stroke="#ffffff20" fontSize={10} axisLine={false} tickLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: "#111", border: "1px solid #ffffff10", borderRadius: "12px", fontSize: "12px" }} 
                      itemStyle={{ color: "#fff" }}
                    />
                    <Area type="monotone" dataKey="count" stroke="#FFFFFF" strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" />
                  </AreaChart>
                </ResponsiveContainer>
             </div>
          </section>

          <section className="glass-card flex flex-col p-6">
             <div className="mb-6 flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white/60">Global Cluster Availability</h3>
                <div className="flex items-center gap-2">
                   <Globe className="h-3 w-3 text-blue-400" />
                   <span className="text-[10px] text-white/30 uppercase tracking-widest font-bold">Multi-Region Failover Active</span>
                </div>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {queueStatus?.regions?.map((reg) => (
                  <div key={reg.id} className="group relative overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02] p-4 transition-all hover:bg-white/[0.05] hover:border-white/10">
                     <div className="mb-3 flex items-center justify-between">
                        <span className={`h-1.5 w-1.5 rounded-full ${reg.status === "online" ? "bg-white shadow-[0_0_8px_white]" : "bg-white/20 animate-pulse"}`} />
                        <span className="text-[10px] font-black tabular-nums text-white/20 uppercase tracking-widest">{reg.latency}</span>
                     </div>
                     <div className="text-[10px] font-black text-white uppercase tracking-widest mb-1">{reg.name}</div>
                     <div className="text-[8px] text-white/30 uppercase tracking-widest">{reg.id}</div>
                  </div>
                ))}
             </div>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section className="glass-card flex flex-col p-6 h-[300px]">
               <h3 className="mb-6 text-xs font-black uppercase tracking-[0.2em] text-white/60">Duration by runtime (ms)</h3>
               <div className="flex-1">
                  <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                    <BarChart data={stats?.executionStats}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                      <XAxis dataKey="language" stroke="#ffffff20" fontSize={10} axisLine={false} tickLine={false} />
                      <YAxis stroke="#ffffff20" fontSize={10} axisLine={false} tickLine={false} />
                      <Tooltip 
                         cursor={{fill: '#ffffff05'}}
                         contentStyle={{ backgroundColor: "#111", border: "1px solid #ffffff10", borderRadius: "12px" }}
                      />
                      <Bar dataKey="avgDurationMs" radius={[4, 4, 0, 0]}>
                        {stats?.executionStats?.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
               </div>
            </section>

            <section className="glass-card flex flex-col p-6 h-[300px]">
               <h3 className="mb-6 text-xs font-black uppercase tracking-[0.2em] text-white/60">Success Rate (%)</h3>
               <div className="flex-1">
                  <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                    <BarChart data={stats?.executionStats} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" horizontal={false} />
                      <XAxis type="number" hide />
                      <YAxis dataKey="language" type="category" stroke="#ffffff40" fontSize={10} width={80} axisLine={false} tickLine={false} />
                      <Tooltip 
                         cursor={{fill: '#ffffff05'}}
                         contentStyle={{ backgroundColor: "#111", border: "1px solid #ffffff10", borderRadius: "12px" }}
                      />
                      <Bar dataKey="successRate" radius={[0, 4, 4, 0]}>
                        {stats?.executionStats?.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.successRate > 80 ? "#10b981" : "#f59e0b"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
               </div>
            </section>
          </div>
        </div>

        {/* Sidebar Status */}
        <div className="lg:col-span-4 flex flex-col gap-6">
           {/* Worker Load */}
           <section className="glass-card p-6 flex flex-col shrink-0">
             <div className="mb-6 flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white/60">Worker Resource Load</h3>
                {queueStatus?.workerOnline ? (
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[8px] font-black text-emerald-400 uppercase tracking-widest border border-emerald-500/20">Active</span>
                ) : (
                  <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[8px] font-black text-rose-400 uppercase tracking-widest border border-rose-500/20">Offline</span>
                )}
             </div>

             <div className="flex flex-col gap-6">
                <LoadMeter 
                  label="CPU Load" 
                  value={queueStatus?.workerStats?.cpuLoad || 0} 
                  max={queueStatus?.workerStats?.cpus || 1}
                  formattedValue={(queueStatus?.workerStats?.cpuLoad || 0).toFixed(2)}
                />
                
                <LoadMeter 
                  label="Memory Usage" 
                  value={(queueStatus?.workerStats?.memTotal - (queueStatus?.workerStats?.memFree || 0)) || 0} 
                  max={queueStatus?.workerStats?.memTotal || 1}
                  formattedValue={formatBytes(queueStatus?.workerStats?.memTotal - (queueStatus?.workerStats?.memFree || 0))}
                  sub={`of ${formatBytes(queueStatus?.workerStats?.memTotal)}`}
                />

                <div className="mt-4 flex flex-col gap-2 rounded-xl bg-white/[0.03] p-4 border border-white/5">
                  <div className="flex items-center justify-between">
                     <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Active Jobs</span>
                     <span className="text-lg font-black text-white">{queueStatus?.workerStats?.activeJobs || 0}</span>
                  </div>
                  <div className="text-[10px] text-white/20 italic">Currently being processed by multiSandbox.js</div>
                </div>
             </div>
           </section>

           {/* Health Summary */}
           <section className="glass-card p-6 flex flex-col flex-1">
              <h3 className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-white/60">SRE Health Summary</h3>
              <div className="flex flex-col gap-4">
                 <HealthItem 
                   status={queueStatus?.online ? "success" : "error"} 
                   label="Edge Gateway" 
                   desc="Enterprise Edge / SSL Proxy"
                 />
                 <HealthItem 
                   status={queueStatus?.workerOnline ? "success" : "warning"} 
                   label="Execution Cluster" 
                   desc={queueStatus?.workerOnline ? "Remote Docker Worker" : "Secondary Piston Fallback"}
                 />
                 <HealthItem 
                   status="success" 
                   label="DB Persistence" 
                   desc="MongoDB Atlas Cluster"
                 />
                 <HealthItem 
                   status="success" 
                   label="Log Streaming" 
                   desc="Redis Pub/Sub Layer"
                 />
              </div>

              {overallSuccessRate < 90 && (
                <div className="mt-auto pt-6">
                  <div className="flex gap-3 rounded-xl bg-amber-500/10 p-4 border border-amber-500/20">
                    <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                    <div>
                      <div className="text-[10px] font-black uppercase text-amber-500 tracking-widest mb-1">Alert: High Error Rate</div>
                      <p className="text-[10px] text-amber-500/70 leading-relaxed">System error budget exceeded for some runtimes. Check compiler logs for patterns.</p>
                    </div>
                  </div>
                </div>
              )}
           </section>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon, title, value, subtext, color }) {
  const colorMap = {
    white: "text-white",
    gray: "text-white/40"
  };
  
  return (
    <motion.div 
      whileHover={{ y: -4 }}
      className="glass-card p-6 flex flex-col gap-4 group"
    >
      <div className="flex items-center justify-between">
         <div className="rounded-xl bg-white/5 p-2 transition-colors group-hover:bg-white/15">
            {React.cloneElement(icon, { size: 20 })}
         </div>
         <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/20">KPI</span>
      </div>
      <div>
        <div className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">{title}</div>
        <div className={`text-2xl font-black ${colorMap[color]}`}>{value}</div>
        <div className="text-[9px] font-medium text-white/20 mt-1 uppercase tracking-widest">{subtext}</div>
      </div>
    </motion.div>
  );
}

function LoadMeter({ label, value, max, formattedValue, sub }) {
  const percentage = Math.min(100, (value / (max || 1)) * 100);
  const colorClass = percentage > 80 ? "bg-white shadow-[0_0_10px_white]" : percentage > 50 ? "bg-white/60 shadow-[0_0_10px_rgba(255,255,255,0.3)]" : "bg-white/30";

  return (
    <div className="flex flex-col gap-2">
       <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest">
          <span className="text-white/40">{label}</span>
          <span className="text-white/80">{formattedValue} <span className="text-white/20 ml-1 font-normal lowercase">{sub}</span></span>
       </div>
       <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            className={`h-full transition-all duration-1000 ${colorClass}`}
          />
       </div>
    </div>
  );
}

function HealthItem({ status, label, desc }) {
  const icons = {
    success: <ShieldCheck className="h-4 w-4 text-emerald-500" />,
    warning: <AlertTriangle className="h-4 w-4 text-amber-500" />,
    error: <AlertTriangle className="h-4 w-4 text-rose-500" />
  };

  return (
    <div className="flex gap-3">
       <div className="mt-0.5 shrink-0">{icons[status]}</div>
       <div>
         <div className="text-[10px] font-black uppercase tracking-widest text-white/80">{label}</div>
         <div className="text-[9px] text-white/30 uppercase tracking-widest mt-0.5">{desc}</div>
       </div>
    </div>
  );
}
