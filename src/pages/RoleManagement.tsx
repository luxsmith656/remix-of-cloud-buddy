import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shield, UserCog, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import type { Tables } from "@/integrations/supabase/types";

type Profile = Tables<"profiles">;
type UserRole = Tables<"user_roles">;

export default function RoleManagement() {
  const queryClient = useQueryClient();
  const { user, isAdmin } = useAuth();
  const [editing, setEditing] = useState<Profile | null>(null);
  const [form, setForm] = useState({ username: "", full_name: "", password: "" });

  const { data: profiles = [], isLoading: profilesLoading } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: roles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ["user_roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*");
      if (error) throw error;
      return data;
    },
  });

  const setRoleMutation = useMutation({
    mutationFn: async ({ targetUserId, enabled }: { targetUserId: string; enabled: boolean }) => {
      const { error } = await supabase.rpc("set_user_role", {
        target_user_id: targetUserId,
        role_value: "admin",
        enabled_value: enabled,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user_roles"] });
      queryClient.invalidateQueries({ queryKey: ["audit_logs"] });
      toast.success("Role updated");
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error("No staff selected");
      const payload: Record<string, unknown> = {
        target_user_id: editing.user_id,
        username: form.username,
        full_name: form.full_name,
      };
      if (form.password) payload.password = form.password;
      const { data, error } = await supabase.functions.invoke("admin-update-user", { body: payload });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      queryClient.invalidateQueries({ queryKey: ["audit_logs"] });
      toast.success("Staff details updated");
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = (p: Profile) => {
    setEditing(p);
    setForm({ username: p.username || "", full_name: p.full_name || "", password: "" });
  };

  const isProfileAdmin = (profile: Profile) => roles.some((role: UserRole) => role.user_id === profile.user_id && role.role === "admin");
  const loading = profilesLoading || rolesLoading;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-heading text-3xl font-bold text-foreground">Role Management</h1>
        <p className="text-muted-foreground mt-1">Manage staff and admin access for registered Elline's Food Product users.</p>
      </div>

      {!isAdmin && (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="p-4 flex items-start gap-3">
            <Shield className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <p className="text-sm text-foreground">Only admins can change roles or edit staff details.</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading users...</div>
          ) : profiles.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No profiles found. Users appear here after signup.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {["Staff", "Username", "Role", "Joined", "Actions"].map((heading) => (
                    <th key={heading} className="text-left p-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {profiles.map((profile) => {
                  const admin = isProfileAdmin(profile);
                  const isSelf = profile.user_id === user?.id;
                  return (
                    <tr key={profile.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                            <UserCog className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{profile.full_name || profile.username || "Unnamed staff"}</p>
                            <p className="text-xs text-muted-foreground">{profile.user_id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">{profile.username || "-"}</td>
                      <td className="p-4">
                        <Badge variant="outline" className={admin ? "bg-success/10 text-success border-success/20" : ""}>
                          {admin ? "ADMIN" : "STAFF"}
                        </Badge>
                      </td>
                      <td className="p-4 text-sm text-muted-foreground">{new Date(profile.created_at).toLocaleDateString()}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" disabled={!isAdmin} onClick={() => openEdit(profile)} className="gap-1.5">
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </Button>
                          <Button
                            size="sm"
                            variant={admin ? "outline" : "default"}
                            disabled={!isAdmin || isSelf || setRoleMutation.isPending}
                            onClick={() => setRoleMutation.mutate({ targetUserId: profile.user_id, enabled: !admin })}
                          >
                            {admin ? "Revoke Admin" : "Make Admin"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="font-heading">Edit Staff Details</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Username</Label>
              <Input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Full Name</Label>
              <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">New Password</Label>
              <Input type="password" placeholder="Leave blank to keep current password" value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
              <p className="text-[11px] text-muted-foreground">Minimum 6 characters. Only set if you want to reset it.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} className="bg-primary text-primary-foreground">
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
