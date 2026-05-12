"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useWizardStore } from "@/lib/wizard/store";
import { tryRunProving } from "@/lib/wizard/liveCalc";
import { getRepository } from "@/lib/data/repository";
import { useCurrentTenant } from "@/lib/tenant/provider";
import { useDirtyState } from "@/lib/nav/dirty-state";
import type {
  AcceptanceProfile,
  Customer,
  Location,
  Meter,
  Product,
  Prover,
} from "@/lib/data/types";
import { StepIndicator } from "./_components/StepIndicator";
import { Step0Contacts } from "./_components/Step0Contacts";
import { Step1Selection } from "./_components/Step1Selection";
import { Step2Conditions } from "./_components/Step2Conditions";
import { Step3Passes } from "./_components/Step3Passes";
import { Step4Review } from "./_components/Step4Review";
import { LiveResults } from "./_components/LiveResults";

function Prefiller() {
  // Reads ?customer=&location=&meter=&prover=&product= from the URL once on mount
  // so deep links from the home page or anywhere else can pre-fill the wizard.
  const params = useSearchParams();
  const wiz = useWizardStore();
  useEffect(() => {
    const patch: Parameters<typeof wiz.prefill>[0] = {};
    const customer = params.get("customer");
    const location = params.get("location");
    const meter = params.get("meter");
    const prover = params.get("prover");
    const product = params.get("product");
    if (customer) patch.customerId = customer;
    if (location) patch.locationId = location;
    if (meter) patch.meterId = meter;
    if (prover) patch.proverId = prover;
    if (product) patch.productId = product;
    if (Object.keys(patch).length) wiz.prefill(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export default function NewProvingPage() {
  const tenant = useCurrentTenant();
  const repo = useMemo(() => getRepository(tenant.id), [tenant.id]);
  const wiz = useWizardStore();

  // Dirty when the user has entered ANYTHING — names, selections, conditions,
  // or any pass data. The wizard store's defaults are all empty/null so this
  // check is straightforward.
  const isDirty =
    wiz.techName.trim().length > 0 ||
    wiz.witnessName.trim().length > 0 ||
    wiz.customerId !== null ||
    wiz.locationId !== null ||
    wiz.meterId !== null ||
    wiz.proverId !== null ||
    wiz.productId !== null ||
    (typeof wiz.densityApi === "number" && wiz.densityApi > 0) ||
    wiz.passes.some(
      (p) =>
        p.pulses !== "" ||
        p.proverTempF !== "" ||
        p.proverPressurePsig !== "" ||
        p.meterTempF !== "" ||
        p.meterPressurePsig !== "",
    );

  useDirtyState(
    "proving-wizard",
    isDirty,
    "You have an unsaved proving in progress. Leave anyway? Your work will be lost.",
  );

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [meters, setMeters] = useState<Meter[]>([]);
  const [provers, setProvers] = useState<Prover[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [acceptanceProfiles, setAcceptanceProfiles] = useState<AcceptanceProfile[]>([]);

  const [meter, setMeter] = useState<Meter | null>(null);
  const [prover, setProver] = useState<Prover | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [acceptance, setAcceptance] = useState<AcceptanceProfile | null>(null);

  useEffect(() => {
    repo.listCustomers().then(setCustomers);
    repo.listProvers().then(setProvers);
    repo.listProducts().then(setProducts);
    repo.listAcceptanceProfiles().then((p) => {
      setAcceptanceProfiles(p);
      if (!wiz.acceptanceProfileId && p[0]) wiz.setAcceptanceProfile(p[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (wiz.customerId) {
      repo.listLocations(wiz.customerId).then(setLocations);
    } else {
      setLocations([]);
    }
  }, [wiz.customerId, repo]);

  useEffect(() => {
    if (wiz.customerId && wiz.locationId) {
      repo.listMeters(wiz.customerId, wiz.locationId).then(setMeters);
    } else {
      setMeters([]);
    }
  }, [wiz.customerId, wiz.locationId, repo]);

  useEffect(() => {
    if (wiz.meterId) repo.getMeter(wiz.meterId).then(setMeter);
    else setMeter(null);
  }, [wiz.meterId, repo]);

  useEffect(() => {
    if (wiz.proverId) repo.getProver(wiz.proverId).then(setProver);
    else setProver(null);
  }, [wiz.proverId, repo]);

  useEffect(() => {
    if (wiz.productId) {
      repo.getProduct(wiz.productId).then((p) => {
        setProduct(p);
        if (p?.defaultDensityApi && wiz.densityApi === "") {
          wiz.setRunInput("densityApi", p.defaultDensityApi);
        }
        if (typeof p?.vaporPressurePsi === "number") {
          wiz.setRunInput("evpPsig", p.vaporPressurePsi);
        }
      });
    } else {
      setProduct(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wiz.productId]);

  useEffect(() => {
    if (wiz.acceptanceProfileId) {
      repo.getAcceptanceProfile(wiz.acceptanceProfileId).then(setAcceptance);
    }
  }, [wiz.acceptanceProfileId, repo]);

  const liveResult =
    meter && prover && product && acceptance &&
    typeof wiz.densityApi === "number" && wiz.densityApi > 0
      ? tryRunProving({
          meter,
          prover,
          product,
          acceptance,
          densityApi: wiz.densityApi,
          densityTempF: typeof wiz.densityTempF === "number" ? wiz.densityTempF : 60,
          densityPressurePsig:
            typeof wiz.densityPressurePsig === "number" ? wiz.densityPressurePsig : 0,
          hydrometerCorrection: wiz.hydrometerCorrection,
          evpPsig: typeof wiz.evpPsig === "number" ? wiz.evpPsig : 0,
          passes: wiz.passes,
        })
      : null;

  const steps = [
    { title: "Tech & Witness", description: "Who's running the proving" },
    { title: "Selection", description: "Customer, meter, prover, product" },
    { title: "Conditions", description: "Density and EVP" },
    { title: "Passes", description: "Live pulses + per-pass data" },
    { title: "Review", description: "Confirm and submit" },
  ];

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Suspense fallback={null}>
        <Prefiller />
      </Suspense>

      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">New proving</h1>
          <p className="text-sm text-muted-foreground">
            Live calculation updates as you enter data.
          </p>
        </div>
      </div>

      <StepIndicator steps={steps} current={wiz.step} onStepClick={wiz.setStep} />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
        <section>
          {wiz.step === 0 && <Step0Contacts />}
          {wiz.step === 1 && (
            <Step1Selection
              customers={customers}
              locations={locations}
              meters={meters}
              provers={provers}
              products={products}
              acceptanceProfiles={acceptanceProfiles}
            />
          )}
          {wiz.step === 2 && <Step2Conditions />}
          {wiz.step === 3 && <Step3Passes meter={meter} prover={prover} />}
          {wiz.step === 4 && (
            <Step4Review
              customer={customers.find((c) => c.id === wiz.customerId)}
              location={locations.find((l) => l.id === wiz.locationId)}
              meter={meter}
              prover={prover}
              product={product}
              acceptance={acceptance}
              liveResult={liveResult}
            />
          )}
        </section>

        <aside>
          <LiveResults result={liveResult} acceptance={acceptance} />
        </aside>
      </div>
    </main>
  );
}
