import { Task, CreateTaskInput, UpdateTaskInput } from '../types';
export interface TaskStoreService {
    getTasks(filter?: {
        status?: string;
    }): Promise<Task[]>;
    getTask(id: string): Promise<Task | null>;
    createTask(input: CreateTaskInput): Promise<Task>;
    updateTask(id: string, input: UpdateTaskInput): Promise<Task>;
    deleteTask(id: string): Promise<void>;
}
export declare function createTaskStore(projectDir: string): TaskStoreService;
