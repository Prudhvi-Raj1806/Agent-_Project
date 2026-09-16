export interface ScheduleItem {
  id: string;
  title: string;
  startsAt: string; // ISO datetime
  createdAt: string;
  updatedAt: string;
}

export interface CreateScheduleItemInput {
  title: string;
  startsAt: string;
}
