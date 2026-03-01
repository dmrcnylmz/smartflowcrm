'use client';

import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// --- Types ---

export interface CallTrendPoint {
  date: string;
  çağrılar: number;
  yanıtlanan: number;
  kaçırılan: number;
}

export interface ComplaintCategoryPoint {
  name: string;
  value: number;
  color: string;
}

export interface AppointmentStatusPoint {
  name: string;
  value: number;
}

interface DashboardChartsProps {
  callTrendData: CallTrendPoint[];
  complaintCategoryData: ComplaintCategoryPoint[];
  appointmentStatusData: AppointmentStatusPoint[];
  loading: boolean;
}

// Shared tooltip style
const tooltipStyle = {
  borderRadius: '12px',
  border: '1px solid rgba(255,255,255,0.1)',
  backgroundColor: 'rgba(0,0,0,0.8)',
  backdropFilter: 'blur(8px)',
};

/**
 * Dashboard chart section — lazy-loaded to keep recharts (~100KB)
 * out of the initial bundle.
 */
export default function DashboardCharts({
  callTrendData,
  complaintCategoryData,
  appointmentStatusData,
  loading,
}: DashboardChartsProps) {
  return (
    <>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Main Chart - Call Trends */}
        <div className="xl:col-span-2 animate-fade-in-up opacity-0" style={{ animationDelay: '500ms', animationFillMode: 'forwards' }}>
          <Card className="rounded-3xl border-white/10 shadow-lg bg-card/50 backdrop-blur-xl overflow-hidden h-full hover-lift">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl">Son 7 Gün Çağrı Trendi</CardTitle>
              <CardDescription>Gelen, yanıtlanan ve kaçırılan çağrıların günlük değişimi.</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {loading ? (
                <Skeleton className="h-[350px] w-full rounded-xl" />
              ) : (
                <div className="h-[350px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={callTrendData} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#888' }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#888' }} dx={-10} />
                      <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: '#fff' }} />
                      <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                      <Line type="monotone" dataKey="çağrılar" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                      <Line type="monotone" dataKey="yanıtlanan" stroke="#10b981" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                      <Line type="monotone" dataKey="kaçırılan" stroke="#ef4444" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Complaints Pie Chart */}
        <div className="xl:col-span-1 animate-fade-in-up opacity-0" style={{ animationDelay: '620ms', animationFillMode: 'forwards' }}>
          <Card className="rounded-3xl border-white/10 shadow-lg bg-card/50 backdrop-blur-xl h-full flex flex-col hover-lift">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl">Şikayet Kategorileri</CardTitle>
              <CardDescription>Aktif ve geçmiş şikayetlerin dağılımı</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-center pt-0">
              {loading ? (
                <Skeleton className="h-[250px] w-full rounded-full" />
              ) : (
                <div className="h-[300px] w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={complaintCategoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                        labelLine={false}
                      >
                        {complaintCategoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: '#fff' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Appointment Bar Chart */}
      <Card className="rounded-3xl border-white/10 shadow-lg bg-card/50 backdrop-blur-xl hover-lift animate-fade-in-up opacity-0" style={{ animationDelay: '740ms', animationFillMode: 'forwards' }}>
        <CardHeader>
          <CardTitle className="text-xl">Randevu Durumları</CardTitle>
          <CardDescription>Son 7 gündeki randevuların işlem durumu</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[300px] w-full rounded-xl" />
          ) : (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={appointmentStatusData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} barSize={40}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#888' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#888' }} dx={-10} />
                  <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                    contentStyle={tooltipStyle}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Bar dataKey="value" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
