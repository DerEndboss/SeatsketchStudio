import { useFile } from '../../state/fileStore';
import { useT } from '../../i18n';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Overlay';

export function ConfirmDialog() {
  const req = useFile((s) => s.confirm);
  const answer = useFile((s) => s.answer);
  const t = useT();
  if (!req) return null;
  return (
    <Dialog
      open
      onClose={() => answer(false)}
      title={req.title}
      width={400}
      footer={
        <>
          <Button variant="ghost" onClick={() => answer(false)}>
            {req.cancel ?? t('confirm.cancel')}
          </Button>
          <Button variant="primary" className={req.danger ? '!bg-danger !text-white' : ''} onClick={() => answer(true)} data-autofocus>
            {req.confirm}
          </Button>
        </>
      }
    >
      <p className="text-[12.5px] leading-relaxed text-muted">{req.body}</p>
    </Dialog>
  );
}
