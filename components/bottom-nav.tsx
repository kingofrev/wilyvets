"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Home, Users, MapPin, Trophy, PlusCircle, Award } from "lucide-react";

const navigation = [
  { name: "Home", href: "/", icon: Home },
  { name: "Players", href: "/players", icon: Users },
  { name: "New", href: "/rounds/new", icon: PlusCircle },
  { name: "Courses", href: "/courses", icon: MapPin },
  { name: "Majors", href: "/majors", icon: Award },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-white">
      <div className="container mx-auto max-w-lg">
        <div className="flex items-center justify-around">
          {navigation.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));
            const isNew = item.name === "New";

            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex flex-col items-center py-2 px-3 text-xs",
                  isNew && "-mt-4",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground"
                )}
              >
                {isNew ? (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
                    <item.icon className="h-6 w-6" />
                  </div>
                ) : (
                  <>
                    <item.icon className="h-5 w-5 mb-1" />
                    <span>{item.name}</span>
                  </>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
