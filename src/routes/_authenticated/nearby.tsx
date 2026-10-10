import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { MapPanel } from "@/components/civic/MapPanel";
import { PageHeader } from "@/components/civic/PageHeader";
import { Button } from "@/components/ui/button";
import { useCurrentProfile } from "@/hooks/useSession";
import { filterByRadius, isValidCoordinate, type Coordinate } from "@/lib/geo";
import { useComplaints, useDistricts } from "@/lib/queries";

const NEARBY_RADIUS_METERS = 3_000;
const CITIZEN_DISTRICTS = new Set(["Hyderabad", "Medchal-Malkajgiri", "Rangareddy"]);

export const Route = createFileRoute("/_authenticated/nearby")({
  head: () => ({
    meta: [
      { title: "Nearby issues — CivicAI" },
      {
        name: "description",
        content:
          "See open infrastructure issues around you on the map and support existing reports instead of filing duplicates.",
      },
      { property: "og:title", content: "Nearby issues — CivicAI" },
      { property: "og:description", content: "Live issue map with one-tap support." },
    ],
  }),
  component: NearbyPage,
});

function NearbyPage() {
  const { data: me } = useCurrentProfile();
  const isFieldOfficer = me?.role === "field_officer";
  const isCitizen = me?.role === "citizen";
  const complaints = useComplaints(
    isFieldOfficer ? { districtId: me?.officer?.district_id ?? undefined } : undefined,
  );
  const districts = useDistricts();
  const [districtId, setDistrictId] = useState<string>("all");
  const [citizenLocation, setCitizenLocation] = useState<Coordinate | null>(null);
  const [locationStatus, setLocationStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationAttempt, setLocationAttempt] = useState(0);
  const activeFilter = isCitizen && districtId === "all" ? "nearby" : districtId;

  useEffect(() => {
    if (!isCitizen || activeFilter !== "nearby") return;

    let cancelled = false;
    setLocationStatus("loading");
    setLocationError(null);

    if (!navigator.geolocation) {
      setLocationStatus("error");
      setLocationError("Location is not available in this browser.");
      return () => {
        cancelled = true;
      };
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (cancelled) return;
        const location = { lat: coords.latitude, lng: coords.longitude };
        if (!isValidCoordinate(location)) {
          setLocationStatus("error");
          setLocationError("Your browser returned an invalid location. Please try again.");
          return;
        }
        setCitizenLocation(location);
        setLocationStatus("ready");
      },
      (error) => {
        if (cancelled) return;
        setLocationStatus("error");
        setLocationError(
          error.code === error.PERMISSION_DENIED
            ? "Location permission was denied. Allow location access or choose a district."
            : error.code === error.TIMEOUT
              ? "Location request timed out. Please try again."
              : "Your current location could not be determined. Please try again.",
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );

    return () => {
      cancelled = true;
    };
  }, [activeFilter, isCitizen, locationAttempt]);

  const rows = useMemo(() => {
    if (isFieldOfficer) {
      return (complaints.data ?? []).filter(
        (complaint) => complaint.district_id === me?.officer?.district_id,
      );
    }

    if (isCitizen && activeFilter === "nearby") {
      return citizenLocation
        ? filterByRadius(complaints.data ?? [], citizenLocation, NEARBY_RADIUS_METERS)
        : [];
    }

    return (complaints.data ?? []).filter(
      (complaint) => activeFilter === "all" || complaint.district_id === activeFilter,
    );
  }, [
    activeFilter,
    citizenLocation,
    complaints.data,
    isCitizen,
    isFieldOfficer,
    me?.officer?.district_id,
  ]);

  const mapped = rows.filter(
    (complaint) =>
      typeof complaint.lat === "number" &&
      Number.isFinite(complaint.lat) &&
      typeof complaint.lng === "number" &&
      Number.isFinite(complaint.lng),
  );
  const district = districts.data?.find(
    (d) => d.id === (isFieldOfficer ? me?.officer?.district_id : activeFilter),
  );
  const center =
    isCitizen && activeFilter === "nearby"
      ? locationStatus === "ready"
        ? citizenLocation
        : null
      : isFieldOfficer
        ? district
          ? { lat: district.center_lat, lng: district.center_lng }
          : mapped[0]
            ? { lat: mapped[0].lat!, lng: mapped[0].lng! }
            : null
        : district
          ? { lat: district.center_lat, lng: district.center_lng }
          : { lat: 18.5204, lng: 73.8567 };

  return (
    <>
      <PageHeader
        eyebrow="Live map"
        title="Issues around the city"
        description="Back an existing report so departments see true severity instead of duplicate tickets."
      />

      {me?.role === undefined
        ? null
        : !isFieldOfficer && (
            <div className="flex flex-wrap gap-1.5">
              {isCitizen ? (
                <Button
                  size="sm"
                  variant={activeFilter === "nearby" ? "default" : "outline"}
                  onClick={() => setDistrictId("all")}
                >
                  Nearby (3 km)
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant={districtId === "all" ? "default" : "outline"}
                  onClick={() => setDistrictId("all")}
                >
                  All districts
                </Button>
              )}
              {(districts.data ?? [])
                .filter((item) => !isCitizen || CITIZEN_DISTRICTS.has(item.name))
                .map((item) => (
                  <Button
                    key={item.id}
                    size="sm"
                    variant={activeFilter === item.id ? "default" : "outline"}
                    onClick={() => setDistrictId(item.id)}
                  >
                    {item.name}
                  </Button>
                ))}
            </div>
          )}

      {isCitizen && activeFilter === "nearby" && locationStatus === "loading" ? (
        <p className="text-sm text-muted-foreground">Finding your current location…</p>
      ) : null}
      {isCitizen && activeFilter === "nearby" && locationStatus === "error" ? (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <p>{locationError}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setLocationAttempt((attempt) => attempt + 1)}
          >
            Try again
          </Button>
        </div>
      ) : null}
      {center ? (
        <MapPanel
          center={center}
          zoom={district ? 14 : 12}
          height="h-[440px]"
          markers={mapped.map((complaint) => ({
            id: complaint.id,
            lat: complaint.lat!,
            lng: complaint.lng!,
            label: complaint.title,
            priority: complaint.priority,
            meta: complaint.address,
          }))}
        />
      ) : null}
    </>
  );
}
