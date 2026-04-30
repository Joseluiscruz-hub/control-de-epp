"use client";

import { useState } from 'react';
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { HardHat, Search, Calendar, AlertTriangle, CheckCircle2, ArrowLeft, Loader2, ShieldCheck } from 'lucide-react';
import { format, isBefore } from 'date-fns';
import { es } from 'date-fns/locale';
import Link from 'next/link';
import { toast } from 'sonner';

interface Assignment {
  id: string;
  sku: string;
  assignedAt: Date;
  nextReplacementAt?: Date;
  status: string;
}

interface Employee {
  id: string;
  name: string;
  area: string;
}

export default function UserPortal() {
  const [employeeId, setEmployeeId] = useState('');
  const [loading, setLoading] = useState(false);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId.trim()) return;

    setLoading(true);
    setSearched(true);
    try {
      // Find employee
      const empQuery = query(collection(db, 'employees'), where('id', '==', employeeId.trim()));
      const empSnap = await getDocs(empQuery);

      if (empSnap.empty) {
        setEmployee(null);
        setAssignments([]);
        toast.error('Empleado no encontrado');
        return;
      }

      const empDoc = empSnap.docs[0];
      setEmployee({
        id: empDoc.data().id,
        name: empDoc.data().name,
        area: empDoc.data().area,
      });

      // Find assignments
      const assQuery = query(
        collection(db, 'assignments'),
        where('employeeId', '==', empDoc.id),
        orderBy('assignedAt', 'desc')
      );
      const assSnap = await getDocs(assQuery);
      
      const assData = assSnap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          sku: data.sku,
          assignedAt: data.assignedAt instanceof Timestamp ? data.assignedAt.toDate() : new Date(),
          nextReplacementAt: data.nextReplacementAt instanceof Timestamp ? data.nextReplacementAt.toDate() : undefined,
          status: data.status,
        };
      });
      setAssignments(assData);
    } catch (error) {
      console.error(error);
      toast.error('Error al buscar información');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Logo and Header */}
        <div className="text-center mb-8 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="inline-flex h-16 w-16 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-700 items-center justify-center shadow-xl shadow-indigo-200 mb-4">
            <ShieldCheck className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Portal del Colaborador</h1>
          <p className="text-gray-500 mt-2">Consulta el estado de tu Equipo de Protección Personal</p>
        </div>

        {!employee ? (
          <Card className="shadow-2xl border-none overflow-hidden animate-in fade-in zoom-in-95 duration-500">
            <div className="h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
            <CardHeader>
              <CardTitle>Identificación</CardTitle>
              <CardDescription>Ingresa tu número de empleado para ver tu historial de EPP.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSearch} className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    placeholder="Ej: 1881"
                    className="pl-10 py-6 text-lg"
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    autoFocus
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full py-6 text-lg bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all active:scale-[0.98]"
                  disabled={loading || !employeeId}
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Search className="h-5 w-5 mr-2" />}
                  Consultar mi EPP
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Profile Info */}
            <Card className="border-none shadow-lg bg-white overflow-hidden">
              <div className="h-2 bg-indigo-500" />
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-14 w-14 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                      <HardHat className="h-8 w-8" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">{employee.name}</h2>
                      <p className="text-sm text-gray-500">ID: {employee.id} • Área: {employee.area}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setEmployee(null)} className="text-gray-400 hover:text-gray-600">
                    <ArrowLeft className="h-4 w-4 mr-2" /> Cambiar
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Assignments List */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider px-1">Tu Equipo Actual</h3>
              {assignments.length === 0 ? (
                <Card className="border-dashed border-2 bg-transparent">
                  <CardContent className="py-12 text-center text-gray-400">
                    <HardHat className="h-12 w-12 mx-auto mb-4 opacity-20" />
                    <p>No tienes equipos registrados actualmente.</p>
                  </CardContent>
                </Card>
              ) : (
                assignments.map((ass) => {
                  const isOverdue = ass.nextReplacementAt && isBefore(ass.nextReplacementAt, new Date());
                  const isActive = ass.status === 'active';
                  
                  return (
                    <Card key={ass.id} className={`border-none shadow-md transition-all hover:shadow-lg ${!isActive ? 'opacity-60' : ''}`}>
                      <CardContent className="p-0">
                        <div className="flex items-stretch">
                          <div className={`w-2 ${isActive ? (isOverdue ? 'bg-red-500' : 'bg-green-500') : 'bg-gray-300'}`} />
                          <div className="flex-1 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                              <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${isActive ? (isOverdue ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600') : 'bg-gray-50 text-gray-400'}`}>
                                {isActive ? <CheckCircle2 className="h-6 w-6" /> : <Calendar className="h-6 w-6" />}
                              </div>
                              <div>
                                <h4 className="font-bold text-gray-900">{ass.sku}</h4>
                                <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                  Entregado el {format(ass.assignedAt, "d 'de' MMMM", { locale: es })}
                                </p>
                              </div>
                            </div>
                            
                            <div className="flex flex-col items-start sm:items-end gap-2">
                              {isActive ? (
                                isOverdue ? (
                                  <Badge className="bg-red-100 text-red-700 border-red-200 gap-1.5 py-1 px-3">
                                    <AlertTriangle className="h-3.5 w-3.5" /> Requiere Cambio
                                  </Badge>
                                ) : (
                                  <Badge className="bg-green-100 text-green-700 border-green-200 gap-1.5 py-1 px-3">
                                    <CheckCircle2 className="h-3.5 w-3.5" /> En buen estado
                                  </Badge>
                                )
                              ) : (
                                <Badge variant="secondary" className="gap-1.5 py-1 px-3">
                                  Histórico
                                </Badge>
                              )}
                              
                              {ass.nextReplacementAt && isActive && (
                                <p className={`text-[10px] font-medium uppercase tracking-tight ${isOverdue ? 'text-red-600' : 'text-gray-400'}`}>
                                  Próximo cambio: {format(ass.nextReplacementAt, "dd/MM/yyyy")}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
            
            <div className="text-center pt-4">
              <p className="text-xs text-gray-400 italic">
                Si detectas algún error en tu historial, contacta a Seguridad Industrial.
              </p>
            </div>
          </div>
        )}
        
        {/* Footer */}
        <div className="mt-12 text-center text-xs text-gray-400">
          <p>© 2026 Control de EPP Industrial • Sistema de Gestión de Seguridad</p>
          <div className="mt-4 flex items-center justify-center gap-4">
            <Link href="/" className="hover:text-indigo-600 transition-colors">Acceso Admin</Link>
            <span className="w-1 h-1 rounded-full bg-gray-300" />
            <a href="#" className="hover:text-indigo-600 transition-colors">Soporte Técnico</a>
          </div>
        </div>
      </div>
    </div>
  );
}
