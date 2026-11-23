import { useCallback, useEffect, useRef, useState } from "react";
import type { Point } from "../../../shared/contracts/receiving";

type LocationRequest = { select: boolean };

function locationMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED)
    return "Разрешите геопозицию для этого сайта или отметьте точку на карте.";
  if (error.code === error.TIMEOUT)
    return "Не успели определить геопозицию. Попробуйте ещё раз или отметьте точку на карте.";
  return "Сейчас геопозиция недоступна. Попробуйте ещё раз или отметьте точку на карте.";
}

export function useMapLocation(initialPoint: Point | undefined, select: (point: Point) => void, locateOnOpen: boolean) {
  const [center, setCenter] = useState(initialPoint);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const request = useRef<LocationRequest>(undefined);
  const interacted = useRef(!!initialPoint);
  const onSelect = useRef(select);
  onSelect.current = select;

  const start = useCallback((selectPoint: boolean) => {
    if (selectPoint) {
      interacted.current = true;
      setLocationError("");
    }
    if (!navigator.geolocation) {
      if (selectPoint) setLocationError("Геопозиция недоступна в этом браузере. Отметьте точку на карте.");
      return;
    }
    if (selectPoint) setLocating(true);
    if (request.current) {
      if (selectPoint) request.current.select = true;
      return;
    }

    const current: LocationRequest = { select: selectPoint };
    request.current = current;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (request.current !== current) return;
        request.current = undefined;
        if (interacted.current && !current.select) return;
        const point = { lat: coords.latitude, lon: coords.longitude };
        setCenter(point);
        if (current.select) {
          setLocating(false);
          onSelect.current(point);
        }
      },
      (error) => {
        if (request.current !== current) return;
        request.current = undefined;
        if (current.select) {
          setLocating(false);
          setLocationError(locationMessage(error));
        }
      },
      { timeout: 15_000 },
    );
  }, []);

  useEffect(() => {
    let active = true;
    if (locateOnOpen) start(true);
    // Only a button press should ask for a new permission.
    void navigator.permissions?.query({ name: "geolocation" }).then(
      ({ state }) => {
        if (active && state === "granted" && !interacted.current) start(false);
      },
      () => {},
    );
    return () => {
      active = false;
      request.current = undefined;
    };
  }, [locateOnOpen, start]);

  function pick(point: Point) {
    interacted.current = true;
    setLocationError("");
    select(point);
  }

  return { center, locating, locationError, locate: () => start(true), pick };
}
