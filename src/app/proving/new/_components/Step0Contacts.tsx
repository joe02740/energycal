"use client";

import { useWizardStore } from "@/lib/wizard/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function Step0Contacts() {
  const wiz = useWizardStore();

  // Tech name is the only hard requirement; witness is best-practice but not blocking.
  const ready = wiz.techName.trim().length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tech & Witness</CardTitle>
        <p className="text-sm text-muted-foreground">
          Captured first so they're locked into the certificate from the start. Witness is
          optional but strongly recommended for custody-transfer provings.
        </p>
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-2">
        <section className="grid gap-3">
          <h3 className="text-sm font-medium">Technician</h3>
          <div className="grid gap-2">
            <Label htmlFor="techName">Name *</Label>
            <Input
              id="techName"
              autoComplete="off"
              value={wiz.techName}
              onChange={(e) => wiz.setContact("tech", "name", e.target.value)}
              placeholder="e.g. Joseph Barney"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="techCompany">Company</Label>
            <Input
              id="techCompany"
              value={wiz.techCompany}
              onChange={(e) => wiz.setContact("tech", "company", e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="techEmail">Email</Label>
            <Input
              id="techEmail"
              type="email"
              autoComplete="off"
              value={wiz.techEmail}
              onChange={(e) => wiz.setContact("tech", "email", e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="techPhone">Phone</Label>
            <Input
              id="techPhone"
              type="tel"
              value={wiz.techPhone}
              onChange={(e) => wiz.setContact("tech", "phone", e.target.value)}
            />
          </div>
        </section>

        <section className="grid gap-3">
          <h3 className="text-sm font-medium">Witness</h3>
          <div className="grid gap-2">
            <Label htmlFor="witnessName">Name</Label>
            <Input
              id="witnessName"
              autoComplete="off"
              value={wiz.witnessName}
              onChange={(e) => wiz.setContact("witness", "name", e.target.value)}
              placeholder="e.g. Chad Miller"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="witnessCompany">Company</Label>
            <Input
              id="witnessCompany"
              value={wiz.witnessCompany}
              onChange={(e) => wiz.setContact("witness", "company", e.target.value)}
              placeholder="Customer name"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="witnessEmail">Email</Label>
            <Input
              id="witnessEmail"
              type="email"
              autoComplete="off"
              value={wiz.witnessEmail}
              onChange={(e) => wiz.setContact("witness", "email", e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="witnessPhone">Phone</Label>
            <Input
              id="witnessPhone"
              type="tel"
              value={wiz.witnessPhone}
              onChange={(e) => wiz.setContact("witness", "phone", e.target.value)}
            />
          </div>
        </section>

        <div className="sm:col-span-2 mt-4 flex justify-end">
          <Button onClick={wiz.next} disabled={!ready}>
            Next
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
