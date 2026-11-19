import { useEffect, useRef, useState } from "react";
import type { Point } from "../../../shared/contracts/receiving";

const toPoint = ({ coords }: GeolocationPosition): Point => ({ lat: coords.latitude, lon: coords.longitude });

export function useMapLocation(initialPoint: Point | undefined, select: (point: Point) => void) {
  const [center, setCenter] = useState(initialPoint);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const request = useRef(0);
  const hasInitialPoint = useRef(!!initialPoint);

  useEffect(() => {
    const current = ++request.current;
    if (!hasInitialPoint.current) {
      navigator.geolocation?.getCurrentPosition(
        (position) => {
          if (request.current === current) setCenter(toPoint(position));
        },
        () => {},
        { maximumAge: 60_000, timeout: 6000 },
      );
    }
    return () => {
      request.current++;
    };
  }, []);

  function pick(point: Point) {
    request.current++;
    setLocationError("");
    select(point);
  }

  function locate() {
    if (!navigator.geolocation) {
      setLocationError("Геопозиция недоступна. Отметьте точку на карте.");
      return;
    }
    const current = ++request.current;
    setLocating(true);
    setLocationError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (request.current !== current) return;
        const point = toPoint(position);
        setLocating(false);
        setCenter(point);
        select(point);
      },
      () => {
        if (request.current !== current) return;
        setLocating(false);
        setLocationError("Не удалось определить геопозицию. Отметьте точку на карте.");
      },
      { timeout: 6000 },
    );
  }

  return { center, locating, locationError, locate, pick };
}
