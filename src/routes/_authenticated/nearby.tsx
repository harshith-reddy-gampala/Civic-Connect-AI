import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { MapPanel } from "@/components/civic/MapPanel";
import { PageHeader } from "@/components/civic/PageHeader";
import { Button } from "@/components/ui/button";
import { useCurrentProfile } from "@/hooks/useSession";
import { useComplaints, useDistricts } from "@/lib/queries";

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
  const complaints = useComplaints(
    isFieldOfficer
      ? { districtId: me?.officer?.district_id ?? undefined }
      : undefined,
  );
  const districts = useDistricts();
  const [districtId, setDistrictId] = useState<string>("all");

  const rows = useMemo(() => {
    if (isFieldOfficer) {
      return (complaints.data ?? []).filter(
        (complaint) => complaint.district_id === me?.officer?.district_id,
      );
    }

    return (complaints.data ?? []).filter(
      (complaint) => districtId === "all" || complaint.district_id === districtId,
    );
  }, [complaints.data, districtId, isFieldOfficer, me?.officer?.district_id]);

  const mapped = rows.filter((c) => c.lat && c.lng);
  const district = districts.data?.find((d) => d.id === (isFieldOfficer ? me?.officer?.district_id : districtId));
  const center = isFieldOfficer
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

      {!isFieldOfficer ? (
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant={districtId === "all" ? "default" : "outline"}
            onClick={() => setDistrictId("all")}
          >
            All districts
          </Button>
          {(districts.data ?? []).map((item) => (
            <Button
              key={item.id}
              size="sm"
              variant={districtId === item.id ? "default" : "outline"}
              onClick={() => setDistrictId(item.id)}
            >
              {item.name}
            </Button>
          ))}
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
