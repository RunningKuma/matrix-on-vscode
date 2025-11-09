import { Command,Uri } from "vscode";
import { Course } from "../shared.js";

export class MatrixNode {
    constructor(
        public readonly course: Course,
        public readonly collapsibleState: boolean
    ) {}

    get label(): string {
        return this.course.name || "未知课程";
    }

    get tooltip(): string {
        return `${this.course.name} (${this.course.course_id})`;
    }

    get command(): Command | undefined {
        return {
            command: "matrix.openCourse",
            title: "打开课程",
            arguments: [this.course]
        };
    }

    get iconPath(): Uri {
        // You can customize the icon based on course properties
        return Uri.file("path/to/default/icon.svg");
    }
}