import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Text, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"

/**
 * OAuth redirect target registered on finbaze-medusa:
 * http://localhost:9000/app/finbaze/callback
 */
const FinbazeCallbackPage = () => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [message, setMessage] = useState("Completing Finbaze connection…")

  useEffect(() => {
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    if (!code || !state) {
      setMessage("Missing OAuth code or state.")
      return
    }

    void (async () => {
      try {
        const response = await fetch("/admin/finbaze/oauth/exchange", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, state }),
        })
        if (!response.ok) {
          const json = (await response.json().catch(() => null)) as {
            message?: string
          } | null
          throw new Error(json?.message ?? "OAuth exchange failed")
        }
        toast.success("Connected to Finbaze")
        navigate("/finbaze?connected=1", { replace: true })
      } catch (error) {
        const text =
          error instanceof Error ? error.message : "OAuth exchange failed"
        setMessage(text)
        toast.error(text)
      }
    })()
  }, [navigate, searchParams])

  return (
    <Container className="flex flex-col gap-2 p-6">
      <Heading level="h1">Finbaze</Heading>
      <Text>{message}</Text>
    </Container>
  )
}

// Nested under /app/finbaze; keep out of the primary nav label noise.
export const config = defineRouteConfig({
  label: "Finbaze callback",
})

export default FinbazeCallbackPage
