import CourseDesigner from '@/components/CourseDesigner';
import ToolSuite from '@/components/ToolSuite';
import { DesignerProvider } from '@/lib/store';

export default function HomePage() {
  return (
    <DesignerProvider>
      <ToolSuite courseDesigner={<CourseDesigner />} />
    </DesignerProvider>
  );
}
