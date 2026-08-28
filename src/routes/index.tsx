import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { backend } from "@/integrations/native/client";

export const Route = createFileRoute("/")({
  ssr: false,
  component: IndexRedirect,
});

function IndexRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    backend.auth.getSession().then(({ data }) => {
      navigate({ to: data.session ? "/dashboard" : "/auth", replace: true });
    });
  }, [navigate]);
  return null;
}
