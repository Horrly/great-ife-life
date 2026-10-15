import { naira } from "../lib/format";

/** The graduation card: the thing people screenshot and share. */
export default function GradCard({ card }) {
  const first = card.class === "First Class";
  const none = card.class === "No degree yet";
  return (
    <article
      className={`reveal overflow-hidden rounded-2xl ${first ? "bg-ife-900 text-white" : "bg-slab text-ink"} border border-line`}
      aria-label={`${card.name}: ${card.class}, CGPA ${card.cgpa.toFixed(2)}`}
    >
      <div className={`flex items-center justify-between px-5 py-3 text-xs font-bold ${first ? "bg-bulb text-ink" : "bg-ife-600 text-white"}`}>
        <span>Great Ife Life</span>
        <span>{none ? "Statement of result" : "Graduation"}</span>
      </div>
      <div className="px-5 pb-6 pt-5">
        <p className={`text-sm ${first ? "text-ife-100" : "text-muted"}`}>
          {card.name}, {card.department}
        </p>
        <h2 className={`reveal-late display mt-2 text-[3.6rem] font-black leading-[0.9] ${first ? "text-bulb" : none ? "text-danger" : "text-ife-900"}`}>
          {card.class}
        </h2>
        <p className="num display mt-2 text-6xl font-black">{card.cgpa.toFixed(2)}</p>
        <p className={`text-sm ${first ? "text-ife-100" : "text-muted"}`}>CGPA on a 5.00 scale</p>

        <dl className={`mt-5 grid grid-cols-2 gap-3 border-t pt-4 text-sm ${first ? "border-white/20" : "border-line"}`}>
          <div>
            <dt className={first ? "text-ife-100" : "text-muted"}>Started as</dt>
            <dd className="font-bold">{card.profile}</dd>
          </div>
          <div>
            <dt className={first ? "text-ife-100" : "text-muted"}>Semesters</dt>
            <dd className="num font-bold">
              {card.semesters}
              {card.semesters > 8 && " (extra year)"}
            </dd>
          </div>
          <div>
            <dt className={first ? "text-ife-100" : "text-muted"}>Lectures attended</dt>
            <dd className="num font-bold">{card.lectures}</dd>
          </div>
          <div>
            <dt className={first ? "text-ife-100" : "text-muted"}>Made from hustles</dt>
            <dd className="num font-bold">{card.hustles ? naira(card.earned) : "None"}</dd>
          </div>
          {card.business_income > 0 && (
            <div>
              <dt className={first ? "text-ife-100" : "text-muted"}>Business income</dt>
              <dd className="num font-bold">{naira(card.business_income)}</dd>
            </div>
          )}
          {card.badges > 0 && (
            <div>
              <dt className={first ? "text-ife-100" : "text-muted"}>Badges</dt>
              <dd className="num font-bold">
                {card.badges}
                {card.badges_total ? ` of ${card.badges_total}` : ""}
              </dd>
            </div>
          )}
        </dl>
        {(card.strike || card.outstanding > 0) && (
          <p className={`mt-4 text-sm font-bold ${first ? "text-bulb" : "text-danger"}`}>
            {[card.strike && "Survived an ASUU strike", card.outstanding > 0 && `${card.outstanding} course${card.outstanding > 1 ? "s" : ""} still outstanding`]
              .filter(Boolean)
              .join(". ")}
          </p>
        )}
      </div>
    </article>
  );
}

export function cardFromGame(game) {
  const f = game.final;
  return {
    name: game.name || "A Great Ife student",
    department: game.department.name,
    profile: game.profile.name,
    cgpa: f.cgpa,
    class: f.class,
    semesters: f.semesters,
    outstanding: f.outstanding.length,
    hustles: f.hustles,
    lectures: f.lectures,
    earned: f.earned,
    strike: Boolean(f.strike),
    badges: f.badges || 0,
    badges_total: game.badges?.length || 0,
    business_income: f.business_income || 0,
    share_code: game.share_code,
  };
}
