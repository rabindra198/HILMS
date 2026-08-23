import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";

function UnauthorizedPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-background p-6 text-foreground md:p-10">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You are logged in as {user?.email || "a user"} with role "{user?.role}".
              This page requires admin privileges.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button asChild className="w-full">
              <Link to="/dashboard">Go to Dashboard</Link>
            </Button>
            <Button variant="outline" onClick={() => navigate("/login")} className="w-full">
              Login as different user
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default UnauthorizedPage;
